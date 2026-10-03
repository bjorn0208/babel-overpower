/**
 * Helper OpenRouter — chamada LLM com tool-calling iterativo.
 *
 * Busca `api_key` em `provedores_llm` (slug = 'openrouter') via cliente admin.
 * Suporta loop tool-calling até `max_iter` iterações.
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

/** Parâmetros pra chamada iterativa com tool-calling. */
export type ParamsLlm = {
  modelo: string;
  mensagens: MensagemLlm[];
  tools?: ToolSchema[];
  /** Máximo de iterações de tool-calling antes de forçar texto final. */
  max_iter?: number;
  /** Callback que executa cada tool e retorna resultado em string. */
  executarTool?: (nome: string, args: Record<string, unknown>) => Promise<string>;
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Sanitização mínima anti-vazamento (2026-08-25): o modelo às vezes escreve o
// próprio raciocínio no content ("Isso responde à pergunta.", "O prompt de
// sistema diz...", rascunho em inglês). Remove linhas-meta; se o texto inteiro
// for rascunho, devolve "" (o chamador trata vazio).
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
    .trim();
  const inicio = limpo.slice(0, 400);
  const rascunho =
    /\b(I need to|I should|Let me|Looking at|The user (wants|asked))\b/i.test(inicio) ||
    /\bposso ignorar\b/i.test(limpo) ||
    /\bo prompt (de |do )?sistema (diz|pede|manda)\b/i.test(limpo) ||
    /\bobedi[êe]ncia cega\b/i.test(limpo);
  return rascunho ? "" : limpo;
}

/** Busca api_key do OpenRouter em provedores_llm. */
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

/** Executa uma chamada ao OpenRouter e retorna a resposta bruta. */
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

/**
 * Chama o LLM via OpenRouter com suporte a tool-calling iterativo.
 *
 * Se o modelo pedir uma tool, chama `executarTool`, adiciona resultado ao
 * histórico e repete. Para após `max_iter` iterações ou quando o modelo
 * responde texto final.
 */
export async function chamarLlmComTools(params: ParamsLlm): Promise<RespostaLlm> {
  const { modelo, tools, max_iter = 3, executarTool } = params;
  const mensagens: MensagemLlm[] = [...params.mensagens];
  const executados: RespostaLlm["tool_calls_executados"] = [];

  const apiKey = await buscarApiKey();

  for (let iter = 0; iter < max_iter; iter++) {
    const resposta = await chamarApi(apiKey, modelo, mensagens, tools);

    // Sem tool_calls → resposta final em texto
    if (!resposta.tool_calls || resposta.tool_calls.length === 0) {
      return {
        texto_final: limparMetaResposta(resposta.conteudo ?? ""),
        tool_calls_executados: executados,
      };
    }

    // Adiciona turno do assistente com tool_calls ao histórico
    mensagens.push({
      role: "assistant",
      content: resposta.conteudo,
      tool_calls: resposta.tool_calls,
    });

    // Executa cada tool e adiciona resultado
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

  // Fallback após max_iter: pede ao modelo texto final sem tools
  const respostaFinal = await chamarApi(apiKey, modelo, mensagens);
  return {
    texto_final: limparMetaResposta(respostaFinal.conteudo ?? "") || "Não consegui gerar resposta.",
    tool_calls_executados: executados,
  };
}

