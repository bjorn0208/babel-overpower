/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// buscar-empresa-google — Reino, tela "Adicionar empresa". Busca livre (nome
// da empresa, + cidade se ajudar) no Google Maps Places (New V2) via RapidAPI
// — MESMA API/chave que a PABX usa em prospectar/enriquecer, reaproveitada
// aqui (Theus, 2026-09-01). Devolve só candidatos pra escolher — nada é
// salvo; quem clica decide, edita e confirma na UI antes do INSERT real.
//
// Segurança: verify_jwt=true + auth.getUser (chamada pelo dono logado).

import { createClient } from "jsr:@supabase/supabase-js@2";

const HOST = "google-map-places-new-v2.p.rapidapi.com";
const CAMPOS = [
  "places.id", "places.displayName", "places.formattedAddress",
  "places.nationalPhoneNumber", "places.internationalPhoneNumber",
  "places.rating", "places.userRatingCount", "places.websiteUri",
  "places.photos",
].join(",");

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

interface CandidatoEmpresa {
  nome: string;
  telefone: string | null;
  endereco: string | null;
  site: string | null;
  avaliacao_google: number | null;
  num_avaliacoes_google: number | null;
  google_place_id: string;
  foto_url: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: quem } = await admin.auth.getUser(jwt);
  if (!quem?.user) return json({ erro: "não autenticado" }, 401);

  const { query } = await req.json().catch(() => ({}));
  const consulta = String(query ?? "").trim();
  if (consulta.length < 2) return json({ erro: "digite ao menos 2 letras" }, 400);

  const { data: chave } = await admin.rpc("obter_segredo_vault", { p_nome: "reino_rapidapi_maps" });
  if (!chave) return json({ erro: "chave do Google Maps não configurada (vault: reino_rapidapi_maps)" }, 409);

  let resp: Response;
  try {
    resp = await fetch(`https://${HOST}/v1/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": CAMPOS,
        "x-rapidapi-host": HOST,
        "x-rapidapi-key": chave,
      },
      body: JSON.stringify({
        textQuery: consulta,
        languageCode: "pt-BR",
        regionCode: "BR",
        pageSize: 8,
      }),
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

  const dados = await resp.json();
  const brutos = ((dados.places ?? []) as Record<string, any>[])
    .filter((p) => p.displayName?.text && p.id)
    .map((p) => ({
      nome: p.displayName.text as string,
      telefone: String(p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? "").replace(/\D/g, "") || null,
      endereco: p.formattedAddress ?? null,
      site: p.websiteUri ?? null,
      avaliacao_google: typeof p.rating === "number" ? p.rating : null,
      num_avaliacoes_google: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      google_place_id: p.id as string,
      foto_ref: p.photos?.[0]?.name as string | undefined,
    }));

  // Foto de capa de cada candidato (a mídia real das outras fotos só é
  // buscada depois, quando a empresa escolhida for aberta pra edição —
  // baixar 8 candidatos × N fotos cada de cara custaria caro à toa).
  const candidatos: CandidatoEmpresa[] = await Promise.all(
    brutos.map(async ({ foto_ref, ...c }) => {
      if (!foto_ref) return { ...c, foto_url: null };
      try {
        const m = await fetch(
          `https://${HOST}/v1/${foto_ref}/media?maxWidthPx=480&skipHttpRedirect=true`,
          { headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": chave } },
        );
        if (m.ok) {
          const j = await m.json();
          return { ...c, foto_url: j.photoUri ?? null };
        }
      } catch { /* segue sem foto */ }
      return { ...c, foto_url: null };
    }),
  );

  return json({ candidatos });
});
