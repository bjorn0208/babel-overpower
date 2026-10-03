/**
 * _shared/openrouter.ts
 *
 * Helper OpenRouter — chamada LLM com tool-calling iterativo.
 *
 * Porte byte-fiel de `agente-mestre-chat/compartilhado/openrouter.ts` (Fusão C1 / Fase 3c.3a).
 * Única diferença permitida: parâmetro `deps?` opcional com `fetch` e `criarClienteAdmin`
 * injetáveis pra teste isolado (sem Deno, sem rede real). Default = globais de produção.
 * Lógica do loop de tool-calling intocada.
 *
 * Estratégia DI (mesma de recall-memoria.ts / identidade-interna.ts):
 *   - Em produção: `deps` ausente → usa `fetch` global (Deno) e importa
 *     `criarClienteAdmin` lazy de `./supabase.ts`.
 *   - Em teste: `deps` injetado com stubs → import dinâmico de `supabase.ts`
 *     nunca ocorre; testes rodam em tsx/node sem libs Deno.
 */

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

/** Dependências injetáveis (testabilidade isolada sem framework de mock). */
export type OpenRouterDeps = {
  // deno-lint-ignore no-explicit-any
  fetch?: (url: string, init?: any) => Promise<any>;
  // deno-lint-ignore no-explicit-any
  criarClienteAdmin?: () => any;
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Busca api_key do OpenRouter em provedores_llm. */
async function buscarApiKey(deps?: OpenRouterDeps): Promise<string> {
  const criarAdmin = deps?.criarClienteAdmin ??
    (await import("./supabase.ts")).criarClienteAdmin;
  const admin = criarAdmin();
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
  deps?: OpenRouterDeps,
): Promise<{ conteudo: string | null; tool_calls?: ToolCallLlm[] }> {
  const body: Record<string, unknown> = { model: modelo, messages: mensagens };
  if (tools && tools.length > 0) body.tools = tools;

  const fetchFn = deps?.fetch ?? fetch;
  const res = await fetchFn(`${OPENROUTER_BASE_URL}/chat/completions`, {
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
/**
 * Remove vazamento de raciocínio interno do modelo no texto final.
 * O Gemini custom-tools às vezes emite blocos "thought" / instruções de
 * sistema DENTRO do content (bug visto no commandbar 2026-07-10:
 * "หลthought / CRITICAL INSTRUCTION 1... / No tools to execute now.").
 * Corta só as linhas de meta-raciocínio, preservando o conteúdo real.
 */
export function limparVazamentoRaciocinio(texto: string): string {
  if (!texto) return texto;
  return texto
    .split("\n")
    .filter((linha) => {
      const l = linha.trim();
      if (/^.{0,12}thought$/i.test(l)) return false;
      if (/^CRITICAL INSTRUCTION/i.test(l)) return false;
      if (/^No tools to execute( now)?\.?/i.test(l)) return false;
      return true;
    })
    .join("\n")
    .replace(/^\s+/, "");
}

export async function chamarLlmComTools(params: ParamsLlm, deps?: OpenRouterDeps): Promise<RespostaLlm> {
  const { modelo, tools, max_iter = 3, executarTool } = params;
  const mensagens: MensagemLlm[] = [...params.mensagens];
  const executados: RespostaLlm["tool_calls_executados"] = [];

  const apiKey = await buscarApiKey(deps);

  for (let iter = 0; iter < max_iter; iter++) {
    const resposta = await chamarApi(apiKey, modelo, mensagens, tools, deps);

    // Sem tool_calls → resposta final em texto
    if (!resposta.tool_calls || resposta.tool_calls.length === 0) {
      return {
        texto_final: limparVazamentoRaciocinio(resposta.conteudo ?? ""),
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
  const respostaFinal = await chamarApi(apiKey, modelo, mensagens, undefined, deps);
  return {
    texto_final: limparVazamentoRaciocinio(respostaFinal.conteudo ?? "") || "Não consegui gerar resposta.",
    tool_calls_executados: executados,
  };
}
