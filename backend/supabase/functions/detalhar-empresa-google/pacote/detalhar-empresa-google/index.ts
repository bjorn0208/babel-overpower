/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// detalhar-empresa-google — Reino, tela "Adicionar empresa". Depois que o
// dono clica num candidato de buscar-empresa-google, esta function traz o
// detalhe completo (até 8 fotos, pra escolher/tirar antes de salvar) daquele
// place_id específico. Mesma chave (vault: reino_rapidapi_maps).
//
// Segurança: verify_jwt=true + auth.getUser.

import { createClient } from "jsr:@supabase/supabase-js@2";

const HOST = "google-map-places-new-v2.p.rapidapi.com";
const CAMPOS = [
  "id", "displayName", "formattedAddress", "addressComponents", "nationalPhoneNumber",
  "internationalPhoneNumber", "rating", "userRatingCount", "websiteUri", "photos",
  "primaryTypeDisplayName",
].join(",");
const MAX_FOTOS = 8;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: quem } = await admin.auth.getUser(jwt);
  if (!quem?.user) return json({ erro: "não autenticado" }, 401);

  const { google_place_id } = await req.json().catch(() => ({}));
  const placeId = String(google_place_id ?? "").trim();
  if (!placeId) return json({ erro: "informe google_place_id" }, 400);

  const { data: chave } = await admin.rpc("obter_segredo_vault", { p_nome: "reino_rapidapi_maps" });
  if (!chave) return json({ erro: "chave do Google Maps não configurada (vault: reino_rapidapi_maps)" }, 409);

  let resp: Response;
  try {
    resp = await fetch(`https://${HOST}/v1/places/${encodeURIComponent(placeId)}?languageCode=pt-BR&regionCode=BR`, {
      headers: {
        "X-Goog-FieldMask": CAMPOS,
        "x-rapidapi-host": HOST,
        "x-rapidapi-key": chave,
      },
    });
  } catch (e) {
    return json({ erro: `Google Maps indisponível: ${(e as Error).message.slice(0, 120)}` }, 502);
  }
  if (resp.status === 429 || resp.status === 403) {
    return json({ erro: "cota do Google Maps esgotada — tente de novo em instantes" }, 429);
  }
  if (!resp.ok) {
    const detalhe = await resp.text();
    return json({ erro: `Google Maps respondeu ${resp.status}`, detalhe: detalhe.slice(0, 400) }, 502);
  }

  const p = await resp.json();

  // CEP via addressComponents (estruturado) em vez de regex no endereço
  // solto — o Places devolve o CEP como um componente próprio ("postal_code").
  type Componente = { longText?: string; shortText?: string; types?: string[] };
  const componentes = (p.addressComponents ?? []) as Componente[];
  const acha = (tipo: string) => componentes.find((c) => c.types?.includes(tipo));
  const cep = (acha("postal_code")?.longText ?? "").replace(/\D/g, "") || null;
  const bairro = acha("sublocality_level_1")?.longText ?? acha("sublocality")?.longText ?? null;
  const rua = acha("route")?.longText ?? "";
  const numero = acha("street_number")?.longText ?? "";
  const enderecoRua = [rua, numero].filter(Boolean).join(", ") || null;

  const nomesFoto = ((p.photos ?? []) as Record<string, string>[])
    .slice(0, MAX_FOTOS).map((f) => f.name).filter(Boolean);
  const imagens = (await Promise.all(nomesFoto.map(async (nome) => {
    try {
      const m = await fetch(`https://${HOST}/v1/${nome}/media?maxWidthPx=1024&skipHttpRedirect=true`, {
        headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": chave },
      });
      if (!m.ok) return null;
      const j = await m.json();
      return (j.photoUri as string) ?? null;
    } catch {
      return null;
    }
  }))).filter(Boolean) as string[];

  return json({
    nome: p.displayName?.text ?? null,
    telefone: String(p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? "").replace(/\D/g, "") || null,
    endereco: enderecoRua ?? p.formattedAddress ?? null,
    endereco_completo: p.formattedAddress ?? null,
    bairro,
    cep,
    categoria: p.primaryTypeDisplayName?.text ?? null,
    site: p.websiteUri ?? null,
    avaliacao_google: typeof p.rating === "number" ? p.rating : null,
    num_avaliacoes_google: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    google_place_id: p.id ?? placeId,
    imagens,
  });
});
