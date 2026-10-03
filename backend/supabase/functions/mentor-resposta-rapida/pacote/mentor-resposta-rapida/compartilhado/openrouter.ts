/**
 * Helper OpenRouter — chamada LLM com tool-calling iterativo.
 * Cópia de agente-mestre-chat/compartilhado/openrouter.ts (deploy MCP não atravessa pastas).
 * Busca `api_key` em `provedores_llm` (slug = 'openrouter') via cliente admin.
 * 2026-08-25: + limparMetaResposta (anti-vazamento de raciocínio PT/EN).
 */

import { criarClienteAdmin } from "./supabase.ts";

export type MensagemLlm = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCallLlm[];
  tool_call_id?: string;
  name?: string;
};

export type ToolCallLlm = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type RespostaLlm = {
  texto_final: string;
  tool_calls_executados: Array<{
    nome: string;
    args: Record<string, unknown>;
    resultado: string;
  }>;
};

export type ParamsLlm = {
  modelo: string;
  mensagens: MensagemLlm[];
  tools?: ToolSchema[];
  max_iter?: number;
  executarTool?: (nome: string, args: Record<string, unknown>) => Promise<string>;
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Sanitização mínima anti-vazamento (2026-08-25): o modelo às vezes escreve o
// próprio raciocínio no content. Remove linhas-meta; texto inteiro rascunho → "".
const LINHAS_META = [
  /^.{0,12}thought$/i,
  /^CRITICAL INSTRUCTION/i,
  /^No tools to execute( now)?\.?/i,
  /^isso responde (à|a) pergunta\.?$/i,
  /^(o|a) (kpi|tool|ferramenta|consulta) (foi|já foi) (chamad|execut|realizad)/i,
  /\bposso ignorar( silenciosamente)?\b/i,
  /^o prompt (de |do )?sistema (diz|pede|manda)/i,
  /^portanto: ["“]/i,
  /^(devo|vou) (responder|entregar|seguir|passar) (exatamente|só|apenas|somente)\b/i,
  /^conforme (o prompt|as regras|as instruções)/i,
];

export function limparMetaResposta(texto: string): string {
  if (!texto) return texto;
  const limpo = texto
    .split("\n")
    .filter((linha) => !LINHAS_META.some((r) => r.test(linha.trim())))
    .join("\n")
    .replace(/\s*isso responde (à|a) pergunta\.?/gi, "")
    .trim();
  const inicio = limpo.slice(0, 400);
  const rascunho =
    /\b(I need to|I should|Let me|Looking at|The user (wants|asked))\b/i.test(inicio) ||
    /\bposso ignorar\b/i.test(limpo) ||
    /\bo prompt (de |do )?sistema (diz|pede|manda)\b/i.test(limpo) ||
    /\bobedi[êe]ncia cega\b/i.test(limpo);
  return rascunho ? "" : limpo;
}

async function buscarApiKey(): Promise<string> {
  const admin = criarClienteAdmin();
  const { data, error } = await admin
    .from("provedores_llm")
    .select("api_key")
    .eq("slug", "openrouter")
    .eq("is_active", true)
    .limit(1)
    .single();
  if (error || !data?.api_key) {
    throw new Error(
      `openrouter: credencial não encontrada em provedores_llm — ${error?.message ?? "api_key vazia"}`,
    );
  }
  return data.api_key as string;
}

async function chamarApi(
  apiKey: string,
  modelo: string,
  mensagens: MensagemLlm[],
  tools?: ToolSchema[],
): Promise<{ conteudo: string | null; tool_calls?: ToolCallLlm[] }> {
  const body: Record<string, unknown> = { model: modelo, messages: mensagens };
  if (tools && tools.length > 0) body.tools = tools;

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://plataformalimpa.com.br",
      "X-Title": "Plataforma Limpa",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${texto}`);
  }

  const json = await res.json();
  const escolha = json.choices?.[0];
  if (!escolha) throw new Error("OpenRouter: resposta sem choices");

  return {
    conteudo: escolha.message?.content ?? null,
    tool_calls: escolha.message?.tool_calls,
  };
}

export async function chamarLlmComTools(params: ParamsLlm): Promise<RespostaLlm> {
  const { modelo, tools, max_iter = 3, executarTool } = params;
  const mensagens: MensagemLlm[] = [...params.mensagens];
  const executados: RespostaLlm["tool_calls_executados"] = [];

  const apiKey = await buscarApiKey();

  for (let iter = 0; iter < max_iter; iter++) {
    const resposta = await chamarApi(apiKey, modelo, mensagens, tools);

    if (!resposta.tool_calls || resposta.tool_calls.length === 0) {
      return {
        texto_final: limparMetaResposta(resposta.conteudo ?? ""),
        tool_calls_executados: executados,
      };
    }

    mensagens.push({
      role: "assistant",
      content: resposta.conteudo,
      tool_calls: resposta.tool_calls,
    });

    for (const tc of resposta.tool_calls) {
      let resultado = "Tool executada.";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments);
        if (executarTool) resultado = await executarTool(tc.function.name, args);
      } catch (e) {
        resultado = `Erro ao executar tool ${tc.function.name}: ${String(e)}`;
      }
      executados.push({ nome: tc.function.name, args, resultado });
      mensagens.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: resultado,
      });
    }
  }

  const respostaFinal = await chamarApi(apiKey, modelo, mensagens);
  return {
    texto_final: limparMetaResposta(respostaFinal.conteudo ?? "") || "Não consegui gerar resposta.",
    tool_calls_executados: executados,
  };
}
