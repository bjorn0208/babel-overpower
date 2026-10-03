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
  // reasoning.exclude: modelos "pensantes" (Gemini 3.1 pro custom-tools) ainda
  // raciocinam, mas o rascunho NÃO volta na resposta — era a fonte do inglês
  // vazando no commandbar. Modelos sem reasoning ignoram o campo.
  const body: Record<string, unknown> = {
    model: modelo,
    messages: mensagens,
    reasoning: { exclude: true },
  };
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
  const limpo = texto
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

  // Rascunho em inglês vazando como resposta final (visto no commandbar do
  // Carlos em 2026-08-02: "I need to check the prices in `produto_conhecimento`…").
  // Devolver "" faz o chamador pedir o fechamento em PT-BR — melhor entregar
  // nada do que entregar o pensamento cru do modelo.
  return pareceRaciocinioCru(limpo) ? "" : limpo;
}

/** Heurística: texto final que na verdade é o rascunho interno do modelo.
 *  Duas camadas: (1) marcadores fortes de raciocínio EN no início; (2) placar
 *  de stopwords EN × PT no texto FORA de blocos de código — citação de dado
 *  PT-BR (com acento) dentro do rascunho não pode mascarar a língua real
 *  (falso-negativo que deixou "I see that the `produtos` table…" vazar em
 *  2026-08-02). */
function pareceRaciocinioCru(texto: string): boolean {
  const t = texto.trim();
  if (t.length < 40) return false;
  // Blocos ``` são citação (contrato, SQL, JSON) — não contam pro placar.
  const semCodigo = t.replace(/```[\s\S]*?```/g, " ");
  const inicio = semCodigo.slice(0, 400);
  const marcadoresEn = [
    /\bI need to\b/i,
    /\bI should\b/i,
    /\bLet me\b/i,
    /\bI (see|can|just|noticed|checked|found|will|'ll|am going)\b/i,
    /\bIt (updated|worked|looks|seems|shows|says)\b/i,
    /\bThe user (wants|asked|said|previously)\b/i,
    /\bThe (response|result|tool|output|query|table|row)s? \b/i,
    /\bto the user\b/i,
    /\bNow (I|the|that)\b/i,
    /\bWait[!,]/i,
    /\bLooking at\b/i,
    /\bFirst, I('| a)/i,
    /\bAccording to the (schema|tool)\b/i,
  ];
  if (marcadoresEn.some((r) => r.test(inicio))) return true;

  // Placar de língua (só stopwords ASCII — \b não funciona com acento):
  // inglês dominante no texto corrido = rascunho, não resposta.
  const en = (semCodigo.match(
    /\b(the|this|that|with|from|user|is|are|was|were|to|of|and|now|then|need|should|see|check|table|value|values|updated?|correctly|response|shows?|confirm|already|can|just|will|so|but|there|have|has)\b/gi,
  ) ?? []).length;
  const pt = (semCodigo.match(
    /\b(que|para|pra|com|uma|mas|como|mais|foi|foram|pelo|pela|isso|esse|essa|sem|dos|das|nos|nas|valores?|contrato|sucesso|atualizado|atualizados|ainda|preciso|verifiquei)\b/gi,
  ) ?? []).length;
  return en >= 6 && en > pt * 1.5;
}

/** Re-pede ao modelo APENAS a resposta final em PT-BR (sem tools). Usado
 *  quando o texto veio vazio ou era rascunho de raciocínio descartado. */
async function pedirFechamentoPt(
  apiKey: string,
  modelo: string,
  mensagens: MensagemLlm[],
  deps?: OpenRouterDeps,
): Promise<string> {
  const comFechamento: MensagemLlm[] = [
    ...mensagens,
    {
      role: "user",
      content:
        "Escreva agora, em português brasileiro, APENAS a resposta final pro usuário — " +
        "sem raciocínio interno, sem inglês, sem meta-comentário. Se executou ações, " +
        "diga o que foi feito, o que deu certo e o que falhou. Só o texto.",
    },
  ];
  const r = await chamarApi(apiKey, modelo, comFechamento, undefined, deps);
  return limparVazamentoRaciocinio(r.conteudo ?? "");
}

/** Último recurso: resumo determinístico do que as ferramentas fizeram. Nunca
 *  dizer "não consegui" tendo executado ação — o usuário precisa saber o que
 *  mudou no sistema (caso Carlos, 2026-08-02). */
function resumoDeterministico(executados: RespostaLlm["tool_calls_executados"]): string {
  const linhas = executados.map((e) => {
    const falhou = typeof e.resultado === "string" && e.resultado.trim().startsWith("✗");
    return `- ${e.nome}: ${falhou ? "FALHOU" : "ok"}${
      falhou ? ` — ${String(e.resultado).replace(/^✗\s*/, "").split("\n")[0]}` : ""
    }`;
  });
  return [
    "Executei as ações, mas não consegui redigir o fechamento. Resumo do que rodou:",
    ...linhas,
    "Se algo falhou, me peça pra refazer só essa parte.",
  ].join("\n");
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
      let texto = limparVazamentoRaciocinio(resposta.conteudo ?? "");
      // Veio vazio OU era rascunho descartado → re-pede o fechamento em PT-BR
      // (antes esse caminho devolvia "" direto e o commandbar mostrava "…"
      // ou o rascunho em inglês).
      if (!texto && ((resposta.conteudo ?? "").trim() || executados.length > 0)) {
        mensagens.push({ role: "assistant", content: resposta.conteudo ?? "" });
        texto = await pedirFechamentoPt(apiKey, modelo, mensagens, deps);
      }
      if (!texto && executados.length > 0) texto = resumoDeterministico(executados);
      return {
        texto_final: texto,
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

  // Fallback após max_iter: pede ao modelo texto final sem tools.
  const respostaFinal = await chamarApi(apiKey, modelo, mensagens, undefined, deps);
  let texto = limparVazamentoRaciocinio(respostaFinal.conteudo ?? "");

  // Fechamento explícito: o modelo às vezes devolve conteúdo vazio (ou só
  // rascunho) depois de uma sequência longa de tools.
  if (!texto) {
    mensagens.push({ role: "assistant", content: respostaFinal.conteudo ?? "" });
    texto = await pedirFechamentoPt(apiKey, modelo, mensagens, deps);
  }
  if (!texto && executados.length > 0) texto = resumoDeterministico(executados);

  return {
    texto_final: texto || "Não consegui gerar resposta.",
    tool_calls_executados: executados,
  };
}