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

import { fireAndForget } from "./fire-and-forget.ts";

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
  /**
   * Tools que só LEEM (nenhum efeito colateral). Quando o modelo pede várias
   * numa mesma rodada e TODAS estão nesta lista, elas rodam em paralelo em vez
   * de uma-a-uma. Fora disso segue serial: tool que escreve pode depender do
   * que a anterior criou.
   */
  tools_somente_leitura?: string[];
  /**
   * Rótulo do `tipo` em `logs_requisicao_llm`. Cada chamada ao modelo é
   * registrada (duração + tokens) — é assim que se enxerga quantas rodadas um
   * turno gastou e quanto cada uma custou.
   */
  tipo_log?: string;
  /**
   * Tenant dono do gasto (bloco 0, 2026-09-16). Vai pra coluna
   * `logs_requisicao_llm.tenant_id` — sem isso não existe orçamento por tenant.
   */
  tenant_id?: string | null;
  /** Campos extras que entram no `metadata` de toda chamada deste turno (ex.: canal, degrau). */
  metadata_log?: Record<string, unknown>;
};

/** Dependências injetáveis (testabilidade isolada sem framework de mock). */
export type OpenRouterDeps = {
  // deno-lint-ignore no-explicit-any
  fetch?: (url: string, init?: any) => Promise<any>;
  // deno-lint-ignore no-explicit-any
  criarClienteAdmin?: () => any;
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Teto por chamada ao LLM. Um turno do canal interno encadeia várias chamadas,
 * então o teto é por chamada, não pelo turno: 45s deixa modelo lento respirar
 * e ainda assim mata a chamada travada bem antes da edge estourar.
 */
const TIMEOUT_LLM_MS = 45_000;

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
): Promise<{
  conteudo: string | null;
  tool_calls?: ToolCallLlm[];
  duracao_ms: number;
  tokens_input: number;
  tokens_output: number;
  tokens_cached: number;
}> {
  const comecou = Date.now();
  // Cache de prompt (custo do Mentor 2026-08-27): a 1ª mensagem 'system' é o
  // bloco que MAIS se repete idêntico entre chamadas (persona + formato +
  // regras do cargo) — marcamos ela pro OpenRouter cachear. Gemini exige o
  // marcador explícito (não é automático como na Anthropic); tokens lidos do
  // cache saem a 25% do preço normal. Sem custo de escrita, TTL ~3-5min —
  // cobre o vai-e-vem normal de uma conversa. Corpo com `content` string
  // (mensagens que não são a 1ª system) segue exatamente como antes.
  const mensagensComCache = mensagens.map((m, i) =>
    i === 0 && m.role === "system" && typeof m.content === "string" && m.content.length > 0
      ? {
        ...m,
        content: [
          { type: "text", text: m.content, cache_control: { type: "ephemeral" } },
        ],
      }
      : m
  );
  // reasoning.exclude: modelos "pensantes" (Gemini 3.1 pro custom-tools) ainda
  // raciocinam, mas o rascunho NÃO volta na resposta — era a fonte do inglês
  // vazando no commandbar. Modelos sem reasoning ignoram o campo.
  const body: Record<string, unknown> = {
    model: modelo,
    messages: mensagensComCache,
    reasoning: { exclude: true },
  };
  if (tools && tools.length > 0) body.tools = tools;

  const fetchFn = deps?.fetch ?? fetch;
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetchFn(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://plataformalimpa.com.br",
        "X-Title": "Plataforma Limpa",
      },
      body: JSON.stringify(body),
      // Sem teto, uma chamada pendurada segurava o turno inteiro até a edge
      // morrer — o usuário via "não consegui falar com o Mentor" sem pista.
      signal: AbortSignal.timeout(TIMEOUT_LLM_MS),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error(
        `OpenRouter não respondeu em ${TIMEOUT_LLM_MS / 1000}s (modelo ${modelo}).`,
      );
    }
    throw e;
  }

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
    duracao_ms: Date.now() - comecou,
    tokens_input: Number(json.usage?.prompt_tokens ?? 0),
    tokens_output: Number(json.usage?.completion_tokens ?? 0),
    tokens_cached: Number(json.usage?.prompt_tokens_details?.cached_tokens ?? 0),
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
// Meta-comentário do modelo EM PORTUGUÊS falando consigo mesmo sobre o prompt
// ou sobre a própria resposta — nunca é conteúdo pro dono. Visto no commandbar
// em 2026-08-25: "O KPI foi chamado, eu posso ignorar silenciosamente e passar
// só o número [...] Isso responde à pergunta." (o filtro antigo só pegava EN).
const LINHAS_META_PT = [
  /^isso responde (à|a) pergunta\.?$/i,
  /^(o|a) (kpi|tool|ferramenta|consulta) (foi|já foi) (chamad|execut|realizad)/i,
  /\bposso ignorar( silenciosamente)?\b/i,
  /^o prompt (de |do )?sistema (diz|pede|manda)/i,
  /^portanto: ["“]/i,
  /^(devo|vou) (responder|entregar|seguir|passar) (exatamente|só|apenas|somente)\b/i,
  /^o (usuário|dono|pedido) (pediu|quer|perguntou) .*(então|logo|portanto)/i,
  /^conforme (o prompt|as regras|as instruções)/i,
  /\bobedi[êe]ncia cega\b/i,
];

export function limparVazamentoRaciocinio(texto: string): string {
  if (!texto) return texto;
  const limpo = texto
    .split("\n")
    .filter((linha) => {
      const l = linha.trim();
      if (/^.{0,12}thought$/i.test(l)) return false;
      if (/^CRITICAL INSTRUCTION/i.test(l)) return false;
      if (/^No tools to execute( now)?\.?/i.test(l)) return false;
      if (LINHAS_META_PT.some((r) => r.test(l))) return false;
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

  // Marcadores fortes de rascunho em PT-BR — o modelo conversando consigo
  // mesmo sobre o prompt/tools (2026-08-25). Checados no texto inteiro sem
  // código: se o "answer" discute as próprias instruções, é rascunho.
  const marcadoresPt = [
    /\bposso ignorar( silenciosamente)?\b/i,
    /\bo prompt (de |do )?sistema (diz|pede|manda)\b/i,
    /\bobedi[êe]ncia cega\b/i,
    /\bisso responde (à|a) pergunta\b/i,
    /\b(kpi|tool|ferramenta) foi (chamad[oa]|executad[oa]), (eu |)posso\b/i,
    /\bconforme o prompt\b/i,
  ];
  if (marcadoresPt.some((r) => r.test(semCodigo))) return true;

  // Placar de língua (só stopwords ASCII — \b não funciona com acento):
  // inglês dominante no texto corrido = rascunho, não resposta.
  const en = (semCodigo.match(
    /\b(the|this|that|with|from|user|is|are|was|were|to|of|and|now|then|need|should|see|check|table|value|values|updated?|correctly|response|shows?|confirm|already|can|just|will|so|but|there|have|has)\b/gi,
  ) ?? []).length;
  const pt = (semCodigo.match(
    /\b(que|para|pra|com|uma|mas|como|mais|foi|foram|pelo|pela|isso|esse|essa|sem|dos|das|nos|nas|valores?|contrato|sucesso|atualizado|atualizados|ainda|preciso|verifiquei)\b/gi,
  ) ?? []).length;
  if (en >= 6 && en > pt * 1.5) return true;

  // Frase curta em inglês SEM nenhum traço de português (sem acento e sem stopword
  // PT) é scaffolding do modelo vazando como resposta — o placar acima não pega
  // porque tem poucas palavras. Visto no Mentor do Diego em 2026-09-16: a pergunta
  // "quantos fechamentos de hoje?" recebeu, como resposta inteira,
  // "This tool call is not expected to fail. Use it normally." (13 tokens, sem tool).
  // Zerar aqui faz o chamador re-pedir o fechamento em PT-BR, que é o certo.
  const temAcento = /[áàâãéêíóôõúüç]/i.test(semCodigo);
  const palavras = semCodigo.trim().split(/\s+/).length;
  if (!temAcento && pt === 0 && en >= 2 && palavras <= 40) return true;

  return false;
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
  const somenteLeitura = new Set(params.tools_somente_leitura ?? []);

  // ── Observabilidade ────────────────────────────────────────────────────────
  // Este cano era o único da plataforma sem medição: um turno de 121s passou
  // despercebido porque nenhuma chamada do canal interno chegava em
  // logs_requisicao_llm. Cada chamada agora é registrada fora do caminho da
  // resposta — log lento ou quebrado nunca atrasa nem derruba o turno.
  const tipoLog = params.tipo_log ?? "llm_tools";
  // deno-lint-ignore no-explicit-any
  let clienteLog: any = null;
  let clienteLogResolvido = false;

  async function obterClienteLog() {
    if (clienteLogResolvido) return clienteLog;
    clienteLogResolvido = true;
    try {
      clienteLog = deps?.criarClienteAdmin
        ? deps.criarClienteAdmin()
        : (await import("./supabase.ts")).criarClienteAdmin();
    } catch {
      clienteLog = null;
    }
    return clienteLog;
  }

  function registrarChamada(
    r: { duracao_ms: number; tokens_input: number; tokens_output: number; tokens_cached?: number },
    metadata: Record<string, unknown>,
  ): void {
    const tarefa = (async () => {
      const sb = await obterClienteLog();
      if (!sb) return;
      const { logLLMCost } = await import("./log-llm-cost.ts");
      await logLLMCost(sb, {
        slug: modelo,
        tokens_input: r.tokens_input,
        tokens_output: r.tokens_output,
        tokens_cached: r.tokens_cached ?? 0,
        latencia_ms: r.duracao_ms,
        tipo: tipoLog,
        tenant_id: params.tenant_id ?? null,
        metadata: { ...(params.metadata_log ?? {}), ...metadata },
      });
    })();
    fireAndForget(tarefa, "log-llm-openrouter", { silent: true });
  }
  const mensagens: MensagemLlm[] = [...params.mensagens];
  const executados: RespostaLlm["tool_calls_executados"] = [];

  const apiKey = await buscarApiKey(deps);

  for (let iter = 0; iter < max_iter; iter++) {
    const resposta = await chamarApi(apiKey, modelo, mensagens, tools, deps);
    registrarChamada(resposta, {
      iteracao: iter,
      tools_no_payload: tools?.length ?? 0,
      tools_pedidas: resposta.tool_calls?.length ?? 0,
    });

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

    // Executa as tools da rodada. Em paralelo só quando TODAS são de leitura —
    // uma tool que escreve pode depender do que a anterior criou, e o modelo
    // pede as duas na mesma rodada sem sinalizar a dependência.
    const chamadas = resposta.tool_calls;
    const podeParalelo = chamadas.length > 1 &&
      chamadas.every((tc) => somenteLeitura.has(tc.function.name));

    const executarUma = async (tc: ToolCallLlm) => {
      let resultado = "Tool executada.";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments);
        if (executarTool) resultado = await executarTool(tc.function.name, args);
      } catch (e) {
        resultado = `Erro ao executar tool ${tc.function.name}: ${String(e)}`;
      }
      return { tc, args, resultado };
    };

    const feitas = podeParalelo
      ? await Promise.all(chamadas.map(executarUma))
      : await (async () => {
        const saida = [];
        for (const tc of chamadas) saida.push(await executarUma(tc));
        return saida;
      })();

    // Ordem preservada: o protocolo exige um `tool` por `tool_call_id`, na ordem.
    for (const { tc, args, resultado } of feitas) {
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
  // Esta chamada é a 7ª quando max_iter=6: é ela que fecha a conta dos 121s.
  registrarChamada(respostaFinal, {
    iteracao: "fallback_final",
    tools_no_payload: 0,
    max_iter_estourado: true,
  });
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