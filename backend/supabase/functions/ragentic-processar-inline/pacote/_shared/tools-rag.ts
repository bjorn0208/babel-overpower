/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// =============================================================================
// tools-rag.ts — despachador genérico de FERRAMENTAS DE AÇÃO SEMÂNTICA
// =============================================================================
// Técnica 4 (a ferramenta É RAG): uma ferramenta de ação semântica é declarada
// no banco com `ferramentas_dinamicas.endpoint_url = 'rag://<busca_hibrida_X>'`.
// Aqui mora o handler ÚNICO que serve qualquer uma delas:
//   embeda o termo do usuário -> chama a busca_hibrida certa -> rerank Cohere -> devolve.
//
// Reusa `gerarEmbeddingQuery` + `rerankCohere` de tools-internas (NÃO duplica o
// pipeline de embedding/rerank — é o mesmo do motor externo).
//
// Adicionar uma busca_hibrida nova ao cano = 1 linha em CONFIG_RPC. Sem isso,
// cai em CONFIG_PADRAO (família A: só p_match_count) — funciona pras RPCs cujos
// demais parâmetros têm DEFAULT.
// =============================================================================

import { EMBED_DIM, EMBED_MODEL, gerarEmbeddingQuery, getCohereCreds, rerankCohere } from "./tools-internas.ts";

// deno-lint-ignore no-explicit-any
type SB = any;

export interface CtxRag {
  tenant_id?: string | null;
  nicho_id?: string | null;
  agente_id?: string | null;
  lead_id?: string | null;
}

// Extrai o nome da RPC de um endpoint `rag://<rpc>`. Retorna null se não for rag.
export function rpcDoEndpoint(endpoint: string | null | undefined): string | null {
  if (!endpoint) return null;
  const m = String(endpoint).match(/^rag:\/\/(.+)$/);
  return m ? m[1].trim() : null;
}

// Cada busca_hibrida_* tem assinatura própria (params além de p_query_text/p_query_embedding).
// Mapa EXPLÍCITO — passar param que a RPC não tem quebra a chamada (PostgREST PGRST202),
// então cada domínio declara exatamente o que recebe. `n` = match_count/top_k já calculado.
const CONFIG_RPC: Record<string, (ctx: CtxRag, n: number) => Record<string, unknown>> = {
  // Família A (p_match_count, escopos com DEFAULT)
  busca_hibrida_conhecimento: (c, n) => ({ p_agent_id: c.agente_id ?? null, p_nicho_id: c.nicho_id ?? null, p_match_count: n }),
  busca_hibrida_comportamento: (c, n) => ({ p_tenant_id: c.tenant_id ?? null, p_nicho_id: c.nicho_id ?? null, p_match_count: n }),
  busca_hibrida_gatilho: (c, n) => ({ p_tenant_id: c.tenant_id ?? null, p_nicho_id: c.nicho_id ?? null, p_match_count: n }),
  busca_hibrida_meta: (c, n) => ({ p_tenant_id: c.tenant_id ?? null, p_nicho_id: c.nicho_id ?? null, p_match_count: n }),
  busca_hibrida_memoria_lead: (c, n) => ({ p_lead_id: c.lead_id ?? null, p_match_count: n, p_tenant_id: c.tenant_id ?? null }),
  busca_hibrida_memoria_episodica: (c, n) => ({ p_tenant_id: c.tenant_id ?? null, p_lead_id: c.lead_id ?? null, p_match_count: n }),
  // Família B (p_top_k, p_tenant_id obrigatório)
  busca_hibrida_procedurais: (c, n) => ({ p_tenant_id: c.tenant_id ?? null, p_nicho_id: c.nicho_id ?? null, p_top_k: n }),
  busca_hibrida_regras_operacionais: (c, n) => ({ p_tenant_id: c.tenant_id ?? null, p_nicho_id: c.nicho_id ?? null, p_top_k: n }),
};

// Default: RPCs de família A cujos demais parâmetros têm DEFAULT aceitam só match_count.
const CONFIG_PADRAO = (_c: CtxRag, n: number): Record<string, unknown> => ({ p_match_count: n });

// deno-lint-ignore no-explicit-any
function textoDoCandidato(b: any): string {
  return `${b.title ?? b.titulo ?? b.nome ?? ""}\n\n${b.content ?? b.conteudo ?? b.texto ?? b.resumo ?? ""}`.trim();
}

/**
 * Handler único das ferramentas de ação semântica (endpoint `rag://<rpc>`).
 * @param rpc  nome da busca_hibrida (já extraído do endpoint via rpcDoEndpoint)
 * @param args args do LLM — espera `busca` (texto natural) e opcional `limite`
 * @returns string JSON pronta pra virar conteúdo de `role: "tool"` no loop do LLM
 */
export async function despacharToolRag(
  sb: SB,
  rpc: string,
  args: Record<string, unknown>,
  ctx: CtxRag,
): Promise<string> {
  const busca = String(args?.busca ?? args?.query ?? args?.termo ?? "").trim();
  if (!busca) {
    return JSON.stringify({ ok: false, mensagem: "Campo 'busca' obrigatório (o que procurar, em linguagem natural)." });
  }
  const limite = Math.min(Math.max(Number(args?.limite ?? 8), 1), 20);

  // 1. Embedding da query (Voyage voyage-4, 1024d, input_type=query)
  const embedding = await gerarEmbeddingQuery(sb, busca);
  if (!embedding || embedding.length !== EMBED_DIM) {
    return JSON.stringify({ ok: false, mensagem: "Falha ao gerar embedding (Cohere) — verifique o provedor." });
  }

  // 2. Busca híbrida (FTS + vetor + RRF) — params montados conforme a assinatura da RPC
  const montar = CONFIG_RPC[rpc] ?? CONFIG_PADRAO;
  const params = { p_query_text: busca, p_query_embedding: embedding, ...montar(ctx, Math.max(limite * 2, 20)) };
  const { data, error } = await sb.rpc(rpc, params);
  if (error) {
    return JSON.stringify({ ok: false, mensagem: `Busca semântica falhou (${rpc}): ${error.message}` });
  }
  // deno-lint-ignore no-explicit-any
  const candidatos: any[] = (data as any[]) ?? [];
  if (candidatos.length === 0) {
    return JSON.stringify({ ok: true, dados: { total: 0, blocos: [], rag_modo: "hibrida_vazia", rpc }, mensagem: "Nada encontrado na base." });
  }

  // 3. Rerank Cohere v3.5 sobre título+conteúdo (campos variam por domínio — tolerante)
  const docs = candidatos.map(textoDoCandidato);
  const temTexto = docs.some((d) => d.length > 0);
  // deno-lint-ignore no-explicit-any
  let finais: any[] = candidatos.slice(0, limite);
  let rag_modo = "hibrida_rrf_apenas";
  if (temTexto) {
    const ranked = await rerankCohere(sb, busca, docs, limite);
    if (ranked && ranked.length > 0) {
      finais = ranked.map((r: { index: number }) => candidatos[r.index]).filter(Boolean).slice(0, limite);
      rag_modo = "hibrida_rrf_mais_rerank_cohere";
    }
  }

  return JSON.stringify({
    ok: true,
    dados: { total: finais.length, blocos: finais, rag_modo, rpc },
    mensagem: `${finais.length} resultado(s) encontrados (modo: ${rag_modo}).`,
  });
}

/**
 * Técnica 2 (LIGADA 2026-08-12 no canal interno): dado o texto do usuário,
 * embeda e ranqueia as ferramentas candidatas pela DESCRIÇÃO
 * (ferramentas_dinamicas.vetor_semantico) via RPC `ferramentas_por_similaridade`.
 * Retorna os nomes das top-K ferramentas, ou null se não der pra ranquear
 * (sem embedding / RPC ausente) — nesse caso o chamador usa o catálogo cheio.
 *
 * `nomes` restringe o ranking ao catálogo já resolvido do cargo. Sem ele a RPC
 * ranqueia a plataforma inteira e gasta slots com ferramenta que o cargo do
 * turno nem pode chamar.
 */
export async function selecionarFerramentasPorSimilaridade(
  sb: SB,
  query: string,
  topK = 8,
  escopo: string | null = null,
  nomes: string[] | null = null,
): Promise<string[] | null> {
  const embedding = await gerarEmbeddingQuery(sb, query);
  if (!embedding) return null;
  const { data, error } = await sb.rpc("ferramentas_por_similaridade", {
    p_query_embedding: embedding,
    p_top_k: topK,
    p_escopo: escopo,
    p_nomes: nomes && nomes.length > 0 ? nomes : null,
  });
  if (error || !data) return null;
  // deno-lint-ignore no-explicit-any
  return (data as any[]).map((r) => String(r.nome_tool));
}


/**
 * Embeda VÁRIOS textos numa única chamada (Voyage voyage-4, 1024d). Usado pra
 * resolução semântica em RUNTIME de catálogos pequenos (ex: produtos do tenant)
 * — quando o alvo não tem vetor persistido. Retorna null se falhar (chamador
 * cai pro fallback literal).
 */
export async function embeddarLote(
  sb: SB,
  textos: string[],
  inputType: "search_query" | "search_document" = "search_document",
): Promise<number[][] | null> {
  if (!textos.length) return null;
  const { apiKey, baseUrl } = await getCohereCreds(sb);
  if (!apiKey) return null;
  // Voyage embeddings: input_type "query"/"document" (mapeado do legado search_query/search_document).
  const tipoVoyage = inputType === "search_query" ? "query" : "document";
  const r = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: textos.map((t) => String(t).slice(0, 8000)),
      input_type: tipoVoyage,
      output_dimension: EMBED_DIM,
      output_dtype: "float",
    }),
  });
  if (!r.ok) {
    console.warn(`[embed lote] ${r.status} ${(await r.text()).slice(0, 200)}`);
    return null;
  }
  // deno-lint-ignore no-explicit-any
  const j: any = await r.json();
  // Voyage retorna data[].embedding na ordem do input.
  // deno-lint-ignore no-explicit-any
  const arr = (j?.data as any[]) ?? [];
  return arr.length ? arr.map((d) => d.embedding as number[]) : null;
}

/** Similaridade do cosseno entre dois vetores de mesma dimensão (0..1 p/ embeddings normalizados). */
export function cosseno(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
