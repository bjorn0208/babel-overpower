/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// NOTA: chamada por cron pg_cron `tag_curadoria_run` (jobid 28, default a cada 3h, configurável via RPC `set_tag_curadoria_intervalo` + tabela `tag_curadoria_config`).
// Também invocada manualmente via UI em VocabularioPanel.tsx → botão "Rodar análise agora".
// Em 2026-05-03 foi removida uma duplicata (jobid 44) que rodava esta mesma edge — o cron principal `tag_curadoria_run` segue ATIVO e é a invocação cravada.
// cron-tags-curadoria — orquestra pipeline de curadoria de tags pra TODOS os nichos.
// Pra cada nicho ativo: backfill_candidatos_tag → embed → generate_tag_merge_suggestions.

import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { embedarLoteVoyage, getVoyageCreds } from "../_shared/voyage-embed.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";
const MAX_BATCH = 96;
const MAX_PER_NICHO = 2000;

async function processarNicho(supabase: SupabaseClient, nichoId: string, apiKey: string, baseUrl: string) {
  const log = { nicho_id: nichoId, candidates: 0, embedded: 0, suggestions: 0 };

  const { data: backResult } = await supabase.rpc("backfill_candidatos_tag", { p_nicho_id: nichoId });
  log.candidates = (backResult as number) ?? 0;

  const { data: pendentes } = await supabase
    .from("candidatos_tag")
    .select("id, tag_text")
    .eq("nicho_id", nichoId)
    .is("vetor_semantico", null)
    .order("num_leads_independentes", { ascending: false })
    .limit(MAX_PER_NICHO);

  const lotes: { id: string; tag_text: string }[][] = [];
  for (let i = 0; i < (pendentes?.length ?? 0); i += MAX_BATCH) {
    lotes.push((pendentes as { id: string; tag_text: string }[]).slice(i, i + MAX_BATCH));
  }

  const PAR = 4;
  for (let i = 0; i < lotes.length; i += PAR) {
    const grupo = lotes.slice(i, i + PAR);
    const resultados = await Promise.all(
      grupo.map((lote) => embedarLoteVoyage(supabase, lote.map((r) => r.tag_text), "document", "embed_tag_curadoria", apiKey, baseUrl).then((vec) => ({ lote, vec }))),
    );
    for (const { lote, vec } of resultados) {
      if (!vec) continue;
      for (let j = 0; j < lote.length; j++) {
        const { error } = await supabase
          .from("candidatos_tag")
          .update({ vetor_semantico: vec[j], embedded_at: new Date().toISOString() })
          .eq("id", lote[j].id);
        if (!error) log.embedded++;
      }
    }
  }

  const { data: genResult } = await supabase.rpc("gerar_sugestoes_fusao_tag", {
    p_nicho_id: nichoId,
    p_threshold: 0.85,
    p_min_leads: 1,
  });
  log.suggestions = (genResult as number) ?? 0;

  return log;
}

Deno.serve(async (req: Request) => {
  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const supabase = criarClienteAdmin();
  const { apiKey, baseUrl } = await getVoyageCreds(supabase);
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "voyage api_key nao configurada" }), { status: 500 });
  }

  const { data: nichos } = await supabase.from("nichos").select("id").eq("ativo", true);
  const inicio = Date.now();
  const logs: unknown[] = [];

  for (const n of (nichos ?? []) as { id: string }[]) {
    try {
      const log = await processarNicho(supabase, n.id, apiKey, baseUrl);
      logs.push(log);
    } catch (e) {
      logs.push({ nicho_id: n.id, error: (e as Error).message });
    }
  }

  const { data: cfg } = await supabase
    .from("config_curadoria_tag")
    .select("intervalo_horas")
    .eq("id", 1)
    .maybeSingle();
  const intervalo = (cfg?.intervalo_horas as number) ?? 3;
  const proxima = new Date(Date.now() + intervalo * 60 * 60 * 1000);

  await supabase
    .from("config_curadoria_tag")
    .update({ last_run_at: new Date().toISOString(), next_run_at: proxima.toISOString() })
    .eq("id", 1);

  return new Response(JSON.stringify({ ok: true, duracao_ms: Date.now() - inicio, logs }), {
    headers: { "Content-Type": "application/json" },
  });
});
