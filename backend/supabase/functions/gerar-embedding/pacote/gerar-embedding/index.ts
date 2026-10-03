// Gerar Embedding — processa fila pgmq.embedding_jobs (Voyage voyage-4 @1024).
// Chamado pelo cron `processar_tarefas_embedding` (pg_cron) via pg_net com array de jobs.
//
// Flow:
//   1. Recebe array de jobs { msg_id, message: { table, row_id, text } }
//   2. Valida tabela (whitelist) + text → embeda em LOTE (Voyage aceita N inputs/request)
//   3. Grava via RPC `aplicar_vetores_lote` (1 UPDATE em massa por tabela = 1 conexão/lote)
//      — NUNCA 1 update por linha via PostgREST (estoura o pool de conexões).
//   4. Em falha de embedding: status='falhou' via mesma RPC (vetor null sinaliza)
//   5. Archive todas as msgs (sucesso ou falha final) pra não reprocessar

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { embedarLoteVoyage } from "../_shared/voyage-embed.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

// Quantos textos por request Voyage. voyage-4 aceita lotes grandes; 128 é folgado e estável.
const CHUNK_VOYAGE = 128;

const TABLE_WHITELIST = new Set([
  // Gavetas RAG originais
  "blocos_comportamento",
  "blocos_gatilho",
  "blocos_humanizacao",
  "memoria_lead",
  "memoria_dono", // bloco 5b (2026-09-16): memória do dono com vetor
  // Pacotes de Conhecimento (upgrade ON/OFF por agente) — 2026-09-15 (estava só no ar, v47; trazido em 16/09)
  "pacotes_conhecimento_blocos",
  "lead_memory_fatos",
  "perguntas_sem_resposta",
  "blocos_conhecimento",
  "blocos_variacao",
  "blocos_meta",
  "memoria_episodica",
  "blocos_procedurais",
  // Gavetas RAG novas (BLOCOS 1 + 3 + 3.5 do agente vivo v188)
  "emocao_blocos",
  "prova_social_blocos",
  "anti_padroes",
  "diretriz_bolha_blocos",
  "manipulacao_blocos",
  "agente_identidade",
  "regras_operacionais_blocos",
  "pivots_categoria_intent",
  "acao_pausa_blocos",
  "automacao_blocos",
  // Requisitos de fase — Projeto: Fase x Requisitos Semanticos (Onda 1)
  "fase_requisitos",
  // Tags candidatas (fusão semântica) + ferramentas dinâmicas (ferramentas_por_similaridade)
  "candidatos_tag",
  "ferramentas_dinamicas",
]);

type Job = {
  msg_id: number;
  message: { table: string; row_id: string; text: string };
};

// deno-lint-ignore no-explicit-any
type Supa = any;

async function gravarLoteTabela(
  supabase: Supa,
  tabela: string,
  ids: string[],
  vetores: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await supabase.rpc("aplicar_vetores_lote", {
    p_tabela: tabela,
    p_ids: ids,
    p_vetores: vetores,
  });
  if (error) {
    console.warn(`[gerar-embedding] rpc aplicar_vetores_lote ${tabela}: ${error.message}`);
    return 0;
  }
  return (data as number) ?? 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
  }

  const jobs = (Array.isArray(body) ? body : []) as Job[];
  if (jobs.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  const supabase = criarClienteAdmin();
  const apiKey = Deno.env.get("VOYAGE_API_KEY") ?? "";
  if (!apiKey) {
    console.error("[gerar-embedding] sem VOYAGE_API_KEY no ambiente da edge");
    return new Response(JSON.stringify({ error: "no_api_key" }), { status: 503 });
  }

  // Separa válidos (whitelist + text); arquiva todos os recebidos.
  const validos: Job[] = [];
  const archiveIds: number[] = [];
  for (const job of jobs) {
    if (!job?.msg_id || !job?.message) continue;
    archiveIds.push(job.msg_id);
    const { table, row_id, text } = job.message;
    if (!TABLE_WHITELIST.has(table) || !row_id || !text?.trim()) continue;
    validos.push(job);
  }

  // Acumula resultados por tabela pra gravar em massa (1 RPC/tabela/lote).
  const porTabela = new Map<string, { ids: string[]; vetores: string[] }>();
  let okEmbed = 0;
  let failEmbed = 0;

  for (let i = 0; i < validos.length; i += CHUNK_VOYAGE) {
    const lote = validos.slice(i, i + CHUNK_VOYAGE);
    const vetores = await embedarLoteVoyage(supabase, lote.map((j) => j.message.text), "document", "embed_fila", apiKey);
    if (!vetores) {
      failEmbed += lote.length;
      continue;
    }
    for (let idx = 0; idx < lote.length; idx++) {
      const j = lote[idx];
      const acc = porTabela.get(j.message.table) ?? { ids: [], vetores: [] };
      acc.ids.push(j.message.row_id);
      acc.vetores.push(`[${vetores[idx].join(",")}]`);
      porTabela.set(j.message.table, acc);
    }
    okEmbed += lote.length;
  }

  // Grava em massa por tabela (sequencial → no máximo 1 conexão por vez).
  let gravados = 0;
  for (const [tabela, acc] of porTabela) {
    gravados += await gravarLoteTabela(supabase, tabela, acc.ids, acc.vetores);
  }

  // Archive todas as msgs recebidas (sucesso ou descartadas) pra não reprocessar.
  if (archiveIds.length > 0) {
    try {
      await supabase.rpc("pgmq_archive_batch", { p_queue: "embedding_jobs", p_msg_ids: archiveIds });
    } catch (e) {
      console.warn(`[gerar-embedding] archive falhou: ${(e as Error).message}`);
    }
  }

  return new Response(
    JSON.stringify({ processed: jobs.length, embedados: okEmbed, gravados, falha_embed: failEmbed }),
    { headers: { "Content-Type": "application/json" } },
  );
});
