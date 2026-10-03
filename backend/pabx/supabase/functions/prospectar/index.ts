// Edge Function: prospecção de empresas no Google Maps.
// API: Google Map Places (New V2) via RapidAPI — endpoint Text Search.
// Usa o pool de chaves em chaves_api (provedor rapidapi_maps) com rodízio.
// 429 é quase sempre limite POR MINUTO: respira e tenta a MESMA chave de novo;
// só persiste → pausa curta (5 min). 403 (assinatura) → pausa 1h.
//
// NUNCA REPETE (18/08): quem já está na base (maps_place_id) é pulado, e a
// busca avança páginas do Google até completar a quantidade pedida com
// empresas NOVAS — era o "sempre me traz os mesmos leads".
import { createClient } from "npm:@supabase/supabase-js@2";

const HOST = "google-map-places-new-v2.p.rapidapi.com";
const CAMPOS = [
  "places.id", "places.displayName", "places.formattedAddress",
  "places.nationalPhoneNumber", "places.internationalPhoneNumber",
  "places.rating", "places.userRatingCount", "places.websiteUri",
  "places.photos", "nextPageToken",
].join(",");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: quem } = await admin.auth.getUser(jwt);
  if (!quem?.user) return json({ erro: "não autenticado" }, 401);
  const { data: perfil } = await admin
    .from("profiles").select("ativo").eq("user_id", quem.user.id).single();
  if (!perfil?.ativo) return json({ erro: "acesso desativado" }, 403);

  const corpo = await req.json();
  const nicho = String(corpo.nicho ?? "").trim();
  const cidade = String(corpo.cidade ?? "").trim();
  const estado = String(corpo.estado ?? "").trim();
  const quantidade = corpo.quantidade;
  if (!nicho || !cidade) return json({ erro: "informe nicho e cidade" }, 400);
  const num = Math.min(Number(quantidade) || 20, 20);
  const consulta = `${nicho} em ${cidade}${estado ? " " + estado : ""}`;

  // Pool de chaves com rodízio
  const { data: chaves } = await admin
    .from("chaves_api")
    .select("id, chave, rotulo")
    .eq("provedor", "rapidapi_maps")
    .eq("ativa", true)
    .or(`esgotada_ate.is.null,esgotada_ate.lt.${new Date().toISOString()}`)
    .order("criado_em");
  if (!chaves?.length) {
    return json({
      erro: "Nenhuma chave RapidAPI disponível. Cadastre uma em Gestão → Chaves " +
        "(ou aguarde a cota liberar).",
    }, 409);
  }

  // Uma requisição com rodízio de chaves: 429 respira e insiste na mesma;
  // persistindo (ou 403), a chave é pausada e a próxima do pool assume.
  let indiceChave = 0;
  async function pedir(body: Record<string, unknown>): Promise<{ resp: Response; chave: typeof chaves[0] } | { erro: Response }> {
    while (indiceChave < chaves.length) {
      const ch = chaves[indiceChave];
      let resp: Response | null = null;
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        try {
          resp = await fetch(`https://${HOST}/v1/places:searchText`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-FieldMask": CAMPOS,
              "x-rapidapi-host": HOST,
              "x-rapidapi-key": ch.chave,
            },
            body: JSON.stringify(body),
          });
        } catch {
          resp = null;
          break; // problema de rede — tenta a próxima chave
        }
        if (resp.status !== 429) break;
        await new Promise((ok) => setTimeout(ok, 1200)); // 429 = limite por minuto: respira
      }
      if (!resp) { indiceChave++; continue; }
      if (resp.status === 429 || resp.status === 403) {
        const pausaMs = resp.status === 403 ? 3600_000 : 300_000;
        await admin.from("chaves_api")
          .update({ esgotada_ate: new Date(Date.now() + pausaMs).toISOString() })
          .eq("id", ch.id);
        indiceChave++;
        continue;
      }
      if (!resp.ok) {
        const detalhe = await resp.text();
        return { erro: json({ erro: `RapidAPI respondeu ${resp.status}`, detalhe: detalhe.slice(0, 500) }, 502) };
      }
      return { resp, chave: ch };
    }
    return {
      erro: json({
        erro: "A cota da RapidAPI estourou agora há pouco. Espere uns 5 minutos e tente de novo " +
          "— ou cadastre uma segunda chave em Gestão → Chaves.",
      }, 429),
    };
  }

  // Avança páginas até juntar `num` empresas que AINDA NÃO estão na base
  const novos: Record<string, unknown>[] = [];
  const vistos = new Set<string>();
  let pulados = 0;
  let token: string | null = null;
  let chaveUsada: typeof chaves[0] | null = null;

  for (let pagina = 0; pagina < 4 && novos.length < num; pagina++) {
    const r = await pedir({
      textQuery: consulta,
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: 20,
      ...(token ? { pageToken: token } : {}),
    });
    if ("erro" in r) {
      // primeira página nem veio → repassa o erro; com resultados, entrega o que há
      if (!novos.length) return r.erro;
      break;
    }
    chaveUsada = r.chave;
    const dados = await r.resp.json();
    token = dados.nextPageToken ?? null;

    const brutos = ((dados.places ?? []) as Record<string, any>[])
      .map((p) => ({
        empresa: p.displayName?.text ?? null,
        telefone:
          String(p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? "")
            .replace(/\D/g, "") || null,
        endereco: p.formattedAddress ?? null,
        site: p.websiteUri ?? null,
        avaliacao: p.rating ?? null,
        num_avaliacoes: p.userRatingCount ?? null,
        maps_place_id: p.id ?? null,
        cidade,
        estado: estado || null,
        nicho,
        foto_ref: p.photos?.[0]?.name ?? null,
      }))
      .filter((r) => r.empresa);

    // quem já está na base sai da roda — é o que fazia "vir sempre os mesmos"
    const ids = brutos.map((b) => b.maps_place_id).filter(Boolean) as string[];
    const jaTem = new Set<string>();
    if (ids.length) {
      const { data: existentes } = await admin
        .from("leads").select("maps_place_id").in("maps_place_id", ids);
      for (const x of existentes ?? []) if (x.maps_place_id) jaTem.add(x.maps_place_id);
    }
    for (const b of brutos) {
      if (novos.length >= num) break;
      const id = b.maps_place_id as string | null;
      if (id && (jaTem.has(id) || vistos.has(id))) { pulados++; continue; }
      if (id) vistos.add(id);
      novos.push(b);
    }
    if (!token) break;
  }

  // foto do lugar: resolve a URL pública da primeira foto (falha = sem foto)
  const resultados = await Promise.all(novos.map(async ({ foto_ref, ...r }) => {
    if (!foto_ref || !chaveUsada) return { ...r, foto_url: null };
    try {
      const m = await fetch(
        `https://${HOST}/v1/${foto_ref}/media?maxWidthPx=640&skipHttpRedirect=true`,
        { headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": chaveUsada.chave } },
      );
      if (m.ok) {
        const j = await m.json();
        return { ...r, foto_url: j.photoUri ?? null };
      }
    } catch { /* segue sem foto */ }
    return { ...r, foto_url: null };
  }));

  return json({
    resultados,
    pulados_ja_na_base: pulados,
    chave_usada: chaveUsada?.rotulo ?? chaveUsada?.id ?? null,
    consulta,
  });
});
