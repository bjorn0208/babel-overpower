/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Helper de log de custo LLM. Cacheia preços de modelos_llm em memória,
// calcula custo via tokens × preço/M, ou aceita custo_total fixo (Cohere rerank
// paga por search, não por token). INSERT em logs_requisicao_llm · silent fail.

type Precos = { input: number; output: number };
let cachePrecos: Map<string, Precos> | null = null;
let cacheCarregando: Promise<Map<string, Precos>> | null = null;

async function carregarPrecos(supabase: SupabaseClient): Promise<Map<string, Precos>> {
  if (cachePrecos) return cachePrecos;
  if (cacheCarregando) return cacheCarregando;
  cacheCarregando = (async () => {
    const m = new Map<string, Precos>();
    const { data } = await supabase
      .from("modelos_llm")
      .select("slug, custo_input_1m, custo_output_1m")
      .eq("is_active", true);
    for (const r of (data ?? []) as Array<{ slug: string; custo_input_1m: number | string; custo_output_1m: number | string }>) {
      m.set(r.slug, {
        input: Number(r.custo_input_1m) || 0,
        output: Number(r.custo_output_1m) || 0,
      });
    }
    cachePrecos = m;
    return m;
  })();
  return cacheCarregando;
}

export type LogLLMParams = {
  slug: string;
  tokens_input?: number;
  tokens_output?: number;
  custo_total?: number;
  latencia_ms: number;
  tipo: string;
  status?: 'sucesso' | 'erro';
  erro?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logLLMCost(supabase: SupabaseClient, params: LogLLMParams): Promise<void> {
  try {
    const tokensIn = params.tokens_input ?? 0;
    const tokensOut = params.tokens_output ?? 0;
    let custo = params.custo_total;
    if (custo == null) {
      const precos = await carregarPrecos(supabase);
      const p = precos.get(params.slug);
      if (p) {
        custo = (tokensIn * p.input) / 1_000_000 + (tokensOut * p.output) / 1_000_000;
      } else {
        custo = 0;
      }
    }
    await supabase.from("logs_requisicao_llm").insert({
      model_slug: params.slug,
      provider_nome: params.slug.startsWith("voyage") ? "voyage" : (params.slug.startsWith("cohere/") || params.slug === "embed-v4.0" ? "cohere" : "openrouter"),
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      custo_total: Number(custo.toFixed(6)),
      tipo: params.tipo,
      status: params.status ?? "sucesso",
      duracao_ms: params.latencia_ms,
      erro: params.erro ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (e) {
    console.warn(`[log-llm-cost] insert falhou: ${(e as Error).message}`);
  }
}
