/**
 * Helper central de embedding via Voyage (migração Cohere→Voyage 2026-06-02).
 *
 * Antes, 4 edges auxiliares (embedar-tags, embedar-persona-campanha,
 * cron-tags-curadoria, cron-cluster-lacunas) tinham `embedBatch` inline
 * chamando Cohere `embed-v4.0` @1536 hardcoded. Com o banco migrado pra
 * halfvec(1024) e a conta Cohere fora do ar, isso quebraria (dimensão +
 * billing). Este módulo centraliza a geração Voyage @1024, provider-agnostic
 * por env — mesmo padrão de config do motor (`_shared/tools-internas.ts`).
 *
 * Uso:
 * ```ts
 * import { embedarLoteVoyage, EMBED_DIM } from "../_shared/voyage-embed.ts";
 * const vetores = await embedarLoteVoyage(supabase, textos, "document", "embed_tag");
 * ```
 */

import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { logLLMCost } from "./log-llm-cost.ts";

// Config provider-agnostic — defaults = decisão Theus 2026-06-02 (voyage-4 @1024).
export const EMBED_MODEL = Deno.env.get("EMBED_MODEL") ?? "voyage-4";
export const EMBED_DIM = Number(Deno.env.get("EMBED_DIM") ?? "1024");
export const EMBED_BASE_URL = Deno.env.get("EMBED_BASE_URL") ?? "https://api.voyageai.com/v1";
const EMBED_API_KEY_ENV = Deno.env.get("EMBED_API_KEY_ENV") ?? "VOYAGE_API_KEY";
const EMBED_PROVIDER_SLUG = Deno.env.get("EMBED_PROVIDER_SLUG") ?? "voyage";
const MAX_INPUT_CHARS = 8000;

/** Tipo de input semântico do Voyage (mapeia o antigo search_document/search_query do Cohere). */
export type VoyageInputType = "document" | "query";

/**
 * Lê a credencial do provedor de embedding (Voyage por default).
 *
 * Ordem de fallback:
 * 1. `Deno.env.get(EMBED_API_KEY_ENV)` (VOYAGE_API_KEY) → baseUrl = EMBED_BASE_URL.
 * 2. Linha ativa em `public.provedores_llm` com `slug = EMBED_PROVIDER_SLUG`.
 *
 * Se nenhuma fonte tiver a key, retorna `apiKey: ""` — o chamador deve checar.
 */
export async function getVoyageCreds(
  supabase: SupabaseClient,
): Promise<{ apiKey: string; baseUrl: string }> {
  const env = Deno.env.get(EMBED_API_KEY_ENV);
  if (env) return { apiKey: env, baseUrl: EMBED_BASE_URL };
  const { data } = await supabase
    .from("provedores_llm")
    .select("api_key, base_url")
    .eq("slug", EMBED_PROVIDER_SLUG)
    .eq("is_active", true)
    .maybeSingle();
  return {
    apiKey: data?.api_key || "",
    baseUrl: data?.base_url || EMBED_BASE_URL,
  };
}

/**
 * Gera embeddings Voyage de um lote de textos, na ordem de entrada.
 *
 * Retorna `number[][]` alinhado por índice com `texts`, ou `null` em falha
 * (HTTP, formato inesperado ou tamanho divergente). Trunca cada texto em
 * MAX_INPUT_CHARS. Loga custo/latência via `logLLMCost`.
 */
export async function embedarLoteVoyage(
  supabase: SupabaseClient,
  texts: string[],
  inputType: VoyageInputType,
  logTipo: string,
  apiKey?: string,
  baseUrl?: string,
): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  let key = apiKey;
  let url = baseUrl;
  if (!key) {
    const creds = await getVoyageCreds(supabase);
    key = creds.apiKey;
    url = creds.baseUrl;
  }
  if (!key) {
    console.warn(`[voyage-embed/${logTipo}] sem ${EMBED_API_KEY_ENV} no ambiente da edge`);
    return null;
  }
  const base = url ?? EMBED_BASE_URL;
  const inputs = texts.map((t) => (t ?? "").slice(0, MAX_INPUT_CHARS));
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: inputs,
        input_type: inputType,
        output_dimension: EMBED_DIM,
        output_dtype: "float",
      }),
    });
    const latencia = Date.now() - t0;
    if (!res.ok) {
      console.warn(`[voyage-embed/${logTipo}] HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      void logLLMCost(supabase, { slug: EMBED_MODEL, custo_total: 0, latencia_ms: latencia, tipo: logTipo, status: "erro", erro: `HTTP ${res.status}` });
      return null;
    }
    const json = await res.json();
    const data = json?.data;
    if (!Array.isArray(data) || data.length !== texts.length) {
      console.warn(`[voyage-embed/${logTipo}] formato inesperado, len=${data?.length} esperado=${texts.length}`);
      return null;
    }
    // Voyage devolve { embedding, index } — ordena por index pra garantir alinhamento.
    const ordenado = [...data].sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
    const vetores = ordenado.map((d) => d?.embedding as number[]);
    if (vetores.some((v) => !Array.isArray(v) || v.length !== EMBED_DIM)) {
      console.warn(`[voyage-embed/${logTipo}] dimensão inesperada (esperado ${EMBED_DIM})`);
      return null;
    }
    const tokensIn = inputs.reduce((acc, t) => acc + Math.ceil((t?.length ?? 0) / 4), 0);
    void logLLMCost(supabase, {
      slug: EMBED_MODEL,
      tokens_input: tokensIn,
      tokens_output: 0,
      latencia_ms: latencia,
      tipo: logTipo,
      status: "sucesso",
      metadata: { batch_size: texts.length },
    });
    return vetores;
  } catch (e) {
    console.warn(`[voyage-embed/${logTipo}] erro batch: ${(e as Error).message}`);
    return null;
  }
}
