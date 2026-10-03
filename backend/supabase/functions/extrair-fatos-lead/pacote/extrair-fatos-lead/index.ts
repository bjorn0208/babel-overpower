/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// extrair-fatos-lead — edge function server-to-server (verify_jwt: false).
// Invocada via ctx.waitUntil (fire-and-forget) pelo chat/index.ts pós-turno.
// INVIOLÁVEL: leadId nunca null — cross-lead leak viola LGPD.

import { criarClienteAdmin } from "../_shared/supabase.ts";
import { ExtractLeadFactsOutputSchema, TiposSinalEngajamento } from "./schema.ts";
import type { ExtractLeadFactsInput } from "./schema.ts";
import { SYSTEM_PROMPT_EXTRACTOR, montarPromptUsuario } from "./prompt.ts";
import { avaliarFatosAntiDup, persistirFatos } from "../_shared/memoria-anti-dup.ts";
import { langfuseTrace } from "./langfuse.ts";

const MODELO_EXTRACTOR = "google/gemma-3-27b-it"; // validado no fonte-graph-builder (24/04): 0 falhas em 16k chamadas pt-BR estruturado; // mesmo modelo de cron-curadoria-llm — consistente e barato

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const input = (await req.json()) as ExtractLeadFactsInput;

    // Validação de campos obrigatórios
    if (!input.conversationId || !input.leadId || !input.tenantId) {
      return jsonResp({ error: "conversationId, leadId e tenantId são obrigatórios" }, 400);
    }

    // INVIOLÁVEL: leadId nunca pode ser string vazia
    if (input.leadId.trim() === "") {
      return jsonResp({ error: "leadId inválido — não pode ser vazio" }, 400);
    }

    // Turno do lead vazio = nada a extrair
    if (!input.turnoLeadContent || input.turnoLeadContent.trim().length < 2) {
      return jsonResp({ extrair_nada: true, justificativa: "turno_lead vazio ou muito curto", fatos_inseridos: 0 });
    }

    const supabase = criarClienteAdmin();

    // --- Busca API key OpenRouter ---
    let apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
    if (!apiKey) {
      const { data: provRow } = await supabase
        .from("provedores_llm")
        .select("api_key, is_active")
        .eq("slug", "openrouter")
        .single();
      if (provRow?.is_active && provRow.api_key) apiKey = provRow.api_key;
    }
    apiKey = apiKey.trim().replace(/[\r\n\t]/g, ""); // bug #14: api_key no banco vinha com whitespace que quebrava fetch ByteString
    if (!apiKey) {
      console.warn("[extrair-fatos-lead] API key OpenRouter não configurada");
      return jsonResp({ error: "API key não configurada" }, 503);
    }

    // --- Monta prompt de usuário ---
    const promptUsuario = montarPromptUsuario({
      turnoLeadContent: input.turnoLeadContent,
      memoriaExistente: input.memoriaAgregada ?? "",
      beliefResumo: input.beliefAtual,
    });

    // --- Chama LLM (Haiku — cheap) ---
    const t0 = Date.now();
    const llmResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://plataforma-limpa.vercel.app",
        "X-Title": "Plataforma Limpa - extrair-fatos-lead",
      },
      body: JSON.stringify({
        model: MODELO_EXTRACTOR,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_EXTRACTOR },
          { role: "user", content: promptUsuario },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 512,
        provider: { sort: "throughput", allow_fallbacks: true },
      }),
    });
    const latencyMs = Date.now() - t0;

    if (!llmResp.ok) {
      const txt = await llmResp.text().catch(() => "");
      console.warn("[extrair-fatos-lead] LLM falhou:", llmResp.status, txt.slice(0, 200));
      return jsonResp({ error: "LLM falhou", status: llmResp.status }, 502);
    }

    const llmData = await llmResp.json();
    const rawContent: string = llmData.choices?.[0]?.message?.content ?? "{}";
    const usage = {
      prompt: llmData.usage?.prompt_tokens ?? 0,
      completion: llmData.usage?.completion_tokens ?? 0,
    };
    // Custo estimado Gemini 2.0 Flash: $0.10/M input + $0.40/M output (via OpenRouter)
    const costUsd = (usage.prompt * 0.0000001) + (usage.completion * 0.0000004);

    // --- Valida output com Zod ---
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.warn("[extrair-fatos-lead] LLM não retornou JSON válido:", rawContent.slice(0, 200));
      return jsonResp({ error: "Output LLM não é JSON" }, 502);
    }

    // Robustez: um sinal de engajamento com tipo fora do enum (alucinação do LLM) NÃO pode
    // derrubar a captura de fatos inteira. Descarta sinais inválidos antes de validar.
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { sinais_engajamento?: unknown }).sinais_engajamento)) {
      const tiposOk = new Set<string>(TiposSinalEngajamento.options);
      const p = parsed as { sinais_engajamento: Array<{ tipo?: string }> };
      p.sinais_engajamento = p.sinais_engajamento.filter((s) => s && typeof s.tipo === "string" && tiposOk.has(s.tipo));
    }

    const validation = ExtractLeadFactsOutputSchema.safeParse(parsed);
    if (!validation.success) {
      console.warn("[extrair-fatos-lead] Output fora do schema Zod:", validation.error.message);
      return jsonResp({ error: "Output fora do schema", detail: validation.error.message }, 502);
    }

    const output = validation.data;

    // --- Langfuse trace (fire-and-forget) ---
    const ert = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
    const tracePromise = langfuseTrace({
      model: MODELO_EXTRACTOR,
      input: { system: SYSTEM_PROMPT_EXTRACTOR.slice(0, 200), user: promptUsuario.slice(0, 500) },
      output,
      metadata: {
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        turn_number: input.turnoCiclo ?? 0,
      },
      tokensUsed: usage,
      latencyMs,
      costUsd,
    });
    if (ert?.waitUntil) ert.waitUntil(tracePromise);
    else tracePromise.catch((e) => console.warn("[langfuse] trace falhou:", (e as Error).message));

    // --- Caminho NOOP: turno sem conteúdo factual ---
    if (output.extrair_nada || (output.fatos.length === 0 && output.sinais_engajamento.length === 0)) {
      return jsonResp({
        extrair_nada: true,
        justificativa: output.justificativa_noop ?? "nenhum fato ou sinal extraído",
        fatos_inseridos: 0,
        sinais: [],
      });
    }

    // --- Gate anti-dup (apenas para fatos — sinais não vão para lead_memory) ---
    const resultadosGate = output.fatos.length > 0
      ? await avaliarFatosAntiDup({
          supabase,
          leadId: input.leadId,
          fatos: output.fatos,
        })
      : [];

    // --- Persistência ---
    const persistResult = resultadosGate.length > 0
      ? await persistirFatos({
          supabase,
          leadId: input.leadId,
          tenantId: input.tenantId,
          resultados: resultadosGate,
          fonteTurno: input.turnoCiclo ?? 0,
        })
      : { inseridos: 0, atualizados: 0, ignorados: 0, erros: [] };

    return jsonResp({
      ok: true,
      extrair_nada: false,
      fatos_inseridos: persistResult.inseridos,
      fatos_atualizados: persistResult.atualizados,
      fatos_ignorados: persistResult.ignorados,
      sinais_engajamento: output.sinais_engajamento,
      erros: persistResult.erros.length > 0 ? persistResult.erros : undefined,
    });
  } catch (e) {
    console.error("[extrair-fatos-lead] exceção não tratada:", (e as Error).message ?? e, (e as Error).stack ?? "");
    return jsonResp({ error: "Erro interno" }, 500);
  }
});
