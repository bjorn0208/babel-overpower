/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// embedar-tags — gera embeddings (Voyage voyage-4, 1024d) das candidatos_tag
// que ainda não foram embedadas. Lote de 96 textos por chamada.
//
// POST /embedar-tags  body: { tenant_id: string }
// Retorna: { processed: number, skipped: number }

import { criarClienteAdmin } from "../_shared/supabase.ts";
import { corsHeaders as CORS } from "../_shared/cors.ts";
import { embedarLoteVoyage, getVoyageCreds } from "../_shared/voyage-embed.ts";

const MAX_BATCH = 96;
const MAX_PER_RUN = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const body = await req.json().catch(() => ({}));
  const nichoId = body?.nicho_id as string | undefined;
  if (!nichoId) {
    return new Response(JSON.stringify({ error: "nicho_id obrigatorio" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const supabase = criarClienteAdmin();
  const { apiKey, baseUrl } = await getVoyageCreds(supabase);
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "voyage api_key nao configurada" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const { data: pendentes, error: errSelect } = await supabase
    .from("candidatos_tag")
    .select("id, tag_text")
    .eq("nicho_id", nichoId)
    .is("vetor_semantico", null)
    .order("num_leads_independentes", { ascending: false })
    .limit(MAX_PER_RUN);

  if (errSelect) {
    return new Response(JSON.stringify({ error: errSelect.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  let processed = 0;
  let skipped = 0;

  const lotes: { id: string; tag_text: string }[][] = [];
  for (let i = 0; i < (pendentes?.length ?? 0); i += MAX_BATCH) {
    lotes.push((pendentes as { id: string; tag_text: string }[]).slice(i, i + MAX_BATCH));
  }

  for (const lote of lotes) {
    const textos = lote.map((r) => r.tag_text);
    const vetores = await embedarLoteVoyage(supabase, textos, "document", "embed_tag", apiKey, baseUrl);
    if (!vetores) {
      skipped += lote.length;
      continue;
    }
    for (let i = 0; i < lote.length; i++) {
      const { error } = await supabase
        .from("candidatos_tag")
        .update({ vetor_semantico: vetores[i], embedded_at: new Date().toISOString() })
        .eq("id", lote[i].id);
      if (error) {
        skipped++;
        console.warn(`[embedar-tags] update id=${lote[i].id}: ${error.message}`);
      } else {
        processed++;
      }
    }
  }

  return new Response(JSON.stringify({ processed, skipped, total_pendentes: pendentes?.length ?? 0 }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
