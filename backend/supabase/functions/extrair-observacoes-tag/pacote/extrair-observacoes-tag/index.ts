/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// extrair-observacoes-tag — Tags Vivas (Motor 2 do plano agente vivo).
// Edge fn server-to-server (verify_jwt:false) invocada fire-and-forget pelo chat
// após Promise.all do post-LLM. Extrai 0-3 tags semânticas por turno e popula
// public.tag_observations. cron-clusterizar-tags-observadas (já existe) consome.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { ExtractTagObservationsOutputSchema } from "./schema.ts";
import type { ExtractTagObservationsInput } from "./schema.ts";
import { SYSTEM_PROMPT_TAG_EXTRACTOR, montarPromptUsuario } from "./prompt.ts";

const MODELO_EXTRACTOR = "google/gemma-3-27b-it"; // validado no fonte-graph-builder (24/04): 0 falhas em 16k chamadas pt-BR estruturado

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
    const input = (await req.json()) as ExtractTagObservationsInput;

    if (!input.conversationId || !input.tenantId) {
      return jsonResp({ error: "conversationId e tenantId são obrigatórios" }, 400);
    }
    if (!input.turnoLeadContent || input.turnoLeadContent.trim().length < 2) {
      return jsonResp({ extrair_nada: true, justificativa: "turno_lead vazio", tags_inseridas: 0 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
    if (!apiKey) {
      const { data: provRow } = await supabase
        .from("provedores_llm")
        .select("api_key, is_active")
        .eq("slug", "openrouter")
        .single();
      if (provRow?.is_active && provRow.api_key) apiKey = provRow.api_key;
    }
    apiKey = apiKey.trim().replace(/[\r\n\t]/g, "");
    if (!apiKey) {
      console.warn("[extrair-observacoes-tag] API key OpenRouter não configurada");
      return jsonResp({ error: "API key não configurada" }, 503);
    }

    const promptUsuario = montarPromptUsuario({
      turnoLeadContent: input.turnoLeadContent,
      turnoAgenteContent: input.turnoAgenteContent ?? "",
    });

    const t0 = Date.now();
    const llmResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://plataforma-limpa.vercel.app",
        "X-Title": "Plataforma Limpa - extrair-observacoes-tag",
      },
      body: JSON.stringify({
        model: MODELO_EXTRACTOR,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_TAG_EXTRACTOR },
          { role: "user", content: promptUsuario },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 400,
        provider: { sort: "throughput", allow_fallbacks: true },
      }),
    });
    const latencyMs = Date.now() - t0;

    if (!llmResp.ok) {
      const txt = await llmResp.text().catch(() => "");
      console.warn("[extrair-observacoes-tag] LLM falhou:", llmResp.status, txt.slice(0, 200));
      return jsonResp({ error: "LLM falhou", status: llmResp.status }, 502);
    }

    const llmData = await llmResp.json();
    const rawContent: string = llmData.choices?.[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.warn("[extrair-observacoes-tag] LLM não retornou JSON:", rawContent.slice(0, 200));
      return jsonResp({ error: "Output LLM não é JSON" }, 502);
    }

    const validation = ExtractTagObservationsOutputSchema.safeParse(parsed);
    if (!validation.success) {
      console.warn("[extrair-observacoes-tag] schema fail:", validation.error.message);
      return jsonResp({ error: "Output fora do schema", detail: validation.error.message }, 502);
    }

    const output = validation.data;

    if (output.extrair_nada || output.tags.length === 0) {
      return jsonResp({
        extrair_nada: true,
        justificativa: output.justificativa_noop ?? "nenhuma tag extraída",
        tags_inseridas: 0,
        latency_ms: latencyMs,
      });
    }

    // Persistência batch em tag_observations
    const linhas = output.tags.map((t) => ({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      lead_id: input.leadId ?? null,
      tag_text: t.tag_text.toLowerCase().trim(),
      contexto_excerto: t.contexto_excerto?.slice(0, 200) ?? null,
      fonte: "agente",
    }));

    const { error: insErr, data: rowsInseridas } = await supabase
      .from("observacoes_tag")
      .insert(linhas)
      .select("id, tag_text");

    if (insErr) {
      console.warn("[extrair-observacoes-tag] INSERT falhou:", insErr.message);
      return jsonResp({ error: "INSERT tag_observations falhou", detail: insErr.message }, 500);
    }

    return jsonResp({
      ok: true,
      extrair_nada: false,
      tags_inseridas: rowsInseridas?.length ?? 0,
      tags: rowsInseridas,
      latency_ms: latencyMs,
    });
  } catch (e) {
    console.error("[extrair-observacoes-tag] exceção:", (e as Error).message ?? e);
    return jsonResp({ error: "Erro interno" }, 500);
  }
});
