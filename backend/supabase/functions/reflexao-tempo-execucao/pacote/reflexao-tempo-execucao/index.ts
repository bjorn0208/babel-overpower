/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// reflexao-runtime — A2 Reflexion loop do plano agente vivo.
// Verificador rejeita → chat invoca esta edge fn fire-and-forget.
// Esta função: chama Gemma 3 27B → gera lição → INSERT reflection_log + meta_chunk experimental.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { SYSTEM_PROMPT_REFLEXAO, montarPromptReflexao } from "./prompt.ts";

const MODELO = "google/gemma-3-27b-it";

type ReflexaoInput = {
  conversationId: string;
  tenantId: string;
  turnoNumero?: number;
  motivoFalha: string;
  respostaOriginal: string;
  ultimaMensagemLead: string;
  detalheVerificador?: Record<string, unknown>;
};

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
    const input = (await req.json()) as ReflexaoInput;
    if (!input.conversationId || !input.tenantId || !input.motivoFalha) {
      return jsonResp({ error: "conversationId, tenantId e motivoFalha são obrigatórios" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Skip cedo: motivo trivial não vale lição
    if (input.motivoFalha === "ok" || input.motivoFalha === "macaquice") {
      return jsonResp({ skipped: true, motivo: "motivo_trivial" });
    }

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
    if (!apiKey) return jsonResp({ error: "API key não configurada" }, 503);

    const promptUsuario = montarPromptReflexao({
      motivo_falha: input.motivoFalha,
      resposta_original: input.respostaOriginal,
      ultima_mensagem_lead: input.ultimaMensagemLead,
      detalhe_verificador: input.detalheVerificador,
    });

    const llmResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://plataforma-limpa.vercel.app",
        "X-Title": "Plataforma Limpa - reflexao-runtime",
      },
      body: JSON.stringify({
        model: MODELO,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_REFLEXAO },
          { role: "user", content: promptUsuario },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 400,
        provider: { sort: "throughput", allow_fallbacks: true },
      }),
    });

    if (!llmResp.ok) {
      const txt = await llmResp.text().catch(() => "");
      console.warn("[reflexao-runtime] LLM falhou:", llmResp.status, txt.slice(0, 200));
      return jsonResp({ error: "LLM falhou", status: llmResp.status }, 502);
    }

    const llmData = await llmResp.json();
    const rawContent: string = llmData.choices?.[0]?.message?.content ?? "{}";

    let parsed: { licao?: string | null; motivo_skip?: string };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.warn("[reflexao-runtime] JSON inválido:", rawContent.slice(0, 200));
      return jsonResp({ error: "Output não é JSON" }, 502);
    }

    if (!parsed.licao) {
      // Registra mesmo assim (audit trail) com licao_gerada=null
      await supabase.from("registro_reflexao").insert({
        conversation_id: input.conversationId,
        tenant_id: input.tenantId,
        turno_numero: input.turnoNumero ?? null,
        motivo_falha: input.motivoFalha,
        detalhe_verificador: input.detalheVerificador ?? {},
        resposta_original: input.respostaOriginal.slice(0, 2000),
        licao_gerada: null,
        status: "rejeitado",
      });
      return jsonResp({ skipped: true, motivo_skip: parsed.motivo_skip ?? "licao_null" });
    }

    const licao = parsed.licao.trim().slice(0, 1000);

    // Cria meta_chunk experimental tag='reflexao_runtime'
    const { data: metaRow, error: metaErr } = await supabase
      .from("blocos_meta")
      .insert({
        escopo: "tenant",
        tenant_id: input.tenantId,
        tag: "reflexao_runtime",
        corpo: licao,
        citacao_kb: `Reflexion (Yao 2022) — gerado em runtime após verificador rejeitar turno por: ${input.motivoFalha}`,
        imutavel: false,
        ativo: false, // começa INATIVO até curador aprovar
        prioridade: 60,
        origem: "reflexao_runtime",
        stability_tier: "experimental",
      })
      .select("id")
      .single();

    if (metaErr || !metaRow) {
      console.warn("[reflexao-runtime] INSERT blocos_meta falhou:", metaErr?.message);
      // Persiste mesmo assim na reflection_log
      await supabase.from("registro_reflexao").insert({
        conversation_id: input.conversationId,
        tenant_id: input.tenantId,
        turno_numero: input.turnoNumero ?? null,
        motivo_falha: input.motivoFalha,
        detalhe_verificador: input.detalheVerificador ?? {},
        resposta_original: input.respostaOriginal.slice(0, 2000),
        licao_gerada: licao,
        status: "rejeitado",
      });
      return jsonResp({ error: "INSERT blocos_meta falhou", licao_gerada: licao }, 500);
    }

    const { data: refRow, error: refErr } = await supabase
      .from("registro_reflexao")
      .insert({
        conversation_id: input.conversationId,
        tenant_id: input.tenantId,
        turno_numero: input.turnoNumero ?? null,
        motivo_falha: input.motivoFalha,
        detalhe_verificador: input.detalheVerificador ?? {},
        resposta_original: input.respostaOriginal.slice(0, 2000),
        licao_gerada: licao,
        meta_bloco_criado_id: metaRow.id,
        status: "gerado",
      })
      .select("id")
      .single();

    if (refErr) console.warn("[reflexao-runtime] INSERT reflection_log falhou:", refErr.message);

    return jsonResp({
      ok: true,
      licao_gerada: licao,
      meta_bloco_id: metaRow.id,
      reflection_log_id: refRow?.id ?? null,
    });
  } catch (e) {
    console.error("[reflexao-runtime] exceção:", (e as Error).message ?? e);
    return jsonResp({ error: "Erro interno" }, 500);
  }
});
