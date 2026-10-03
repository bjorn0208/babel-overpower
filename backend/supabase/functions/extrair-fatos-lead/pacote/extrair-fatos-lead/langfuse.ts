/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// Wrapper Langfuse fire-and-forget — reutilizável pelas outras edges depois.
// Se secret LANGFUSE_SECRET_KEY não estiver configurado, apenas loga console.warn e segue.
// NUNCA bloqueia o fluxo principal.
// Fonte: agent-output/analises/reuniao-analista-2026-04-20.md

export type LangfuseTraceParams = {
  model: string;
  input: unknown;
  output: unknown;
  metadata: {
    tenant_id: string;
    agent_id?: string;
    conversation_id: string;
    turn_number: number;
    rag_chunk_ids?: string[];
  };
  tokensUsed: { prompt: number; completion: number };
  latencyMs: number;
  costUsd: number;
};

/**
 * Envia trace para Langfuse de forma assíncrona (fire-and-forget).
 * Nunca lança exceção — falhas são logadas com console.warn.
 */
export async function langfuseTrace(params: LangfuseTraceParams): Promise<void> {
  const secretKey = Deno.env.get("LANGFUSE_SECRET_KEY");
  const publicKey = Deno.env.get("LANGFUSE_PUBLIC_KEY");
  const host = Deno.env.get("LANGFUSE_HOST") ?? "https://cloud.langfuse.com";

  if (!secretKey || !publicKey) {
    console.warn("[langfuse] secrets não configurados — trace ignorado. conversation_id:", params.metadata.conversation_id);
    return;
  }

  try {
    const traceId = crypto.randomUUID();
    const now = new Date().toISOString();

    const body = {
      batch: [
        {
          id: traceId,
          type: "trace-create",
          timestamp: now,
          body: {
            id: traceId,
            name: "extrair-fatos-lead",
            metadata: {
              ...params.metadata,
              model: params.model,
              cost_usd: params.costUsd,
              latency_ms: params.latencyMs,
              tokens_prompt: params.tokensUsed.prompt,
              tokens_completion: params.tokensUsed.completion,
            },
            input: params.input,
            output: params.output,
          },
        },
        {
          id: crypto.randomUUID(),
          type: "generation-create",
          timestamp: now,
          body: {
            traceId,
            name: "extrair-fatos-lead-llm",
            model: params.model,
            startTime: new Date(Date.now() - params.latencyMs).toISOString(),
            endTime: now,
            input: params.input,
            output: params.output,
            usage: {
              promptTokens: params.tokensUsed.prompt,
              completionTokens: params.tokensUsed.completion,
              totalTokens: params.tokensUsed.prompt + params.tokensUsed.completion,
            },
            metadata: {
              cost_usd: params.costUsd,
              tenant_id: params.metadata.tenant_id,
              conversation_id: params.metadata.conversation_id,
            },
          },
        },
      ],
    };

    const credentials = btoa(`${publicKey}:${secretKey}`);
    const resp = await fetch(`${host}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${credentials}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.warn(`[langfuse] falha ao enviar trace: ${resp.status} — ${txt.slice(0, 200)}`);
    }
  } catch (e) {
    console.warn("[langfuse] exceção ao enviar trace:", (e as Error).message ?? e);
  }
}
