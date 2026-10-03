// _shared/canal-interno.ts
//
// Fusão C1 / Fase 3c.3b — processamento do canal INTERNO (dono logado no commandbar).
//
// Porta o fluxo de `agente-mestre-chat/index.ts` L48-180 com adaptações:
//   - Persona RAG-first: MOLDE_FORMATO mínimo (só formato) + cargo do banco por cima.
//     Sem persona hardcoded — cargo comanda. Resolve bug de cargo curto sem regredir.
//   - ehAdmin já resolvido server-side pelo chamador (D1: sem cargo_tipologia do cliente).
//   - Recall sob demanda via tool `recall_entidade` (DEC-036: destilação = Tcog futura).
//   - Modelo: google/gemini-3.1-flash-lite (D2 síntese — substitui gemini-2.5-flash do Mentor).
//   - DI opcional (deps) pra testabilidade isolada em tsx/node (padrão recall-memoria.ts).
//
// IMPORTANTE: import dinâmico lazy de todas as deps Deno (_shared/tools-mentor.ts,
// _shared/recall-memoria.ts, _shared/openrouter.ts, _shared/supabase.ts) — igual
// identidade-interna.ts. Em produção o Deno resolve normalmente; em teste o caller
// injeta deps e o import dinâmico nunca é tocado.

import { blocoTemporalBRT } from "./mentor-guardas.ts";

// deno-lint-ignore no-explicit-any
type AnyClient = any;

/** Formato mínimo de saída das respostas: só instrução de idioma/formato.
 *  Persona/objetivo = 100% do cargo do banco — jamais hardcoded aqui. */
const MOLDE_FORMATO =
  "Responda SEMPRE em português brasileiro, com pelo menos uma frase de texto " +
  "pro usuário mesmo ao acionar tool. NUNCA devolva resposta vazia: se faltar " +
  "contexto, pergunte. Quando pedirem ação no sistema, use as tools. " +
  "Ao citar leads/contatos, use o NOME da pessoa; se o lead não tiver nome, " +
  "chame de \"contato final NNNN\" (últimos 4 dígitos) — NUNCA use o telefone " +
  "inteiro como identificador no texto. Nunca inclua raciocínio interno, " +
  "instruções de sistema ou meta-comentários na resposta — só o conteúdo final. " +
  "Responda SOMENTE o que foi pedido, no formato pedido: as ferramentas devolvem " +
  "mais dados do que a pergunta — filtre e entregue apenas a parte que responde " +
  "ao pedido, sem contexto nem sugestão que não foram pedidos.";

// Bug Diego 2026-05-18 (histórico): a 3c.3 usava "google/gemini-3.1-flash-lite" —
// esse modelo + as 15 tools (TOOLS_MENTOR) no chamarLlmComTools devolvia content
// VAZIO sem tool-call → mentor_mensagens gravava "" → commandbar mostrava "…".
// Por isso a troca pra PRO (`google/gemini-3.1-pro-preview-customtools`) em maio.
//
// 2026-08-27: baixado pro Flash Lite por custo, após reteste que não reproduziu
// o bug. 2026-09-04: Theus voltou pro PRO — o Mentor tinha perdido qualidade e a
// economia era irrelevante (458 turnos/mês custavam US$ 1,71 no total). O PRO já
// tem 369 chamadas reais neste código sem uma única resposta vazia.
//
// Este valor agora é só o FALLBACK. A fonte da verdade é `config_chamadas_llm`,
// chave `canal_<canal>` (ex.: `canal_mentor`), lida via getConfigChamada — mesma
// mecânica que porteiro/síntese/extrator já usavam. Antes o modelo do Mentor era
// o único cravado em código, e por isso a linha `canal_mentor` do banco existia
// apontando pra PRO enquanto a realidade rodava Flash Lite, sem ninguém ver.
// Trocar de modelo agora é UPDATE no banco, sem deploy.
const MODELO_INTERNO = "google/gemini-3.1-pro-preview-customtools";

/**
 * Tools que só LEEM. Quando o modelo pede várias destas na mesma rodada, elas
 * rodam em paralelo em vez de uma-a-uma (turno de 121s medido em 2026-08-10).
 * Só entra aqui o que não escreve nada: uma tool que grava pode depender do
 * que a anterior criou, e o modelo pede as duas juntas sem avisar.
 */
const TOOLS_SOMENTE_LEITURA = [
  "consultar_dados",
  "mostrar_kpi",
  "dashboard_resumo",
  "listar_leads_recentes",
  "buscar_leads_inteligente",
  "listar_leads_por_dia",
  "listar_conversas",
  "pesquisar_google",
  "consultar_instagram",
  "recall_entidade",
];
// Custo do Mentor (2026-08-27): histórico é a única parte do prompt que NUNCA
// cacheia (muda a cada turno) — 20 mensagens cruas por chamada pesava demais.
// 12 = 6 idas-e-vindas, sobra pra manter o fio da conversa num commandbar.
// Resumir turnos mais antigos em vez de só cortar é uma melhoria futura maior
// (outra chamada de LLM, outro ponto de falha) — não entrou nesta rodada.
const MAX_HISTORICO = 12;

/**
 * Tools de ESCRITA/DESTRUIÇÃO — nível de permissão (Dominic, 2026-08-25):
 * só o DONO da conta (userId === tenant efetivo) ou platform_admin executa.
 * Sub-usuário da equipe (parent_user_id preenchido) recebe recusa educada e
 * segue com todo o catálogo de leitura. Checado em executarToolFinal — os
 * catálogos/seleção semântica NÃO são gate de permissão.
 */
const TOOLS_ESCRITA_SO_DONO = new Set([
  "atualizar_dados",
  "excluir_dados",
  "cadastrar_produto",
  "criar_cliente",
  "atualizar_empresa",
  "criar_categoria",
  "criar_template_contrato",
  "gerar_link_contrato_livre",
  "gerar_link_contrato_de_produto",
  "cadastrar_bloco_conhecimento",
]);

/** Schema da tool `recall_entidade` adicionada ao array de tools do LLM. */
const SCHEMA_RECALL_ENTIDADE = {
  type: "function" as const,
  function: {
    name: "recall_entidade",
    description:
      "Busca informações de um lead/cliente pelo nome. Use quando o dono perguntar " +
      'sobre uma pessoa específica (ex: "como tá o João?", "situação da Maria Silva"). ' +
      "Retorna fatos, histórico e dados de contato.",
    parameters: {
      type: "object",
      properties: {
        nome: {
          type: "string",
          description: "Nome (parcial ou completo) da pessoa a buscar.",
        },
      },
      required: ["nome"],
    },
  },
};

/** Argumentos da função principal. */
export type ArgsCanalInterno = {
  mensagem: string;
  conversaId: string;
  userId: string;
  /** Já resolvido server-side pelo chamador (D1 — nunca vem do cliente). */
  ehAdmin: boolean;
  /** tenant_id da empresa = profiles.parent_user_id ?? userId (já resolvido). */
  tenantId: string;
  /**
   * Canal interno (Onda 2C.8 do app Curadoria fullscreen, 2026-05-27).
   * - 'mentor' (default): canal interno do dono do tenant — cargo Mentor/Admin
   *   conforme `ehAdmin`. Carrega TOOLS_MENTOR.
   * - 'curadoria': cargo Curadoria global (platform_admin no app
   *   /admin/curadoria). Carrega TOOLS_CURADORIA.
   * - 'financeiro': assistente financeiro do dono via WhatsApp (webhook valida
   *   o número em financeiro_config_tenant). Cargo Financeiro global +
   *   TOOLS_FINANCEIRO.
   * Quando omitido → 'mentor' preserva comportamento histórico.
   */
  canal?: "mentor" | "curadoria" | "financeiro" | "rifas";
  /** Documento financeiro processado neste turno (só canal='financeiro'). */
  documentoTurnoId?: string | null;
  /** Origem dos movimentos do turno: comprovante | extrato (só canal='financeiro'). */
  origemTurno?: string | null;
  /** Rótulo de quem enviou a mensagem do turno (autoria — só canal='financeiro'). */
  autorTurno?: string | null;
  /** Slug da aba ativa (só usado quando canal='curadoria'). */
  contextoAba?: string | null;
  /** Tenant impersonado pelo platform_admin (só canal='curadoria'). */
  tenantImpersonadoId?: string | null;
  /** Override de modelo escolhido pelo usuário no SeletorLlm (opcional). */
  modeloOverride?: string | null;
};

/** Resultado da função principal. */
export type ResultadoCanalInterno = {
  ok: boolean;
  mensagem: string;
  // deno-lint-ignore no-explicit-any
  tool_calls: any[];
  status?: number;
  erro?: string;
};

/** Dependências injetáveis pra teste isolado. */
export type CanalInternoDeps = {
  supabaseAdmin?: AnyClient;
  // deno-lint-ignore no-explicit-any
  chamarLlm?: (params: any) => Promise<{ texto_final: string; tool_calls_executados: any[] }>;
  // deno-lint-ignore no-explicit-any
  recall?: (admin: AnyClient, params: { tenantId: string; termo: string; leadId?: string | null; queryRecall?: string }) => Promise<any>;
};

/** Chave de comparação de número: "R$ 2.388,00", "2388" e "2388.0" viram a mesma. */
function chaveNumero(bruto: unknown): string | null {
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto.toFixed(2) : null;
  let t = String(bruto ?? "").trim().replace(/R\$|\s|%/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

/** Todos os números que aparecem num texto (resultado de tool, em JSON). */
export function numerosDoTexto(texto: string): string[] {
  const achados: string[] = [];
  for (const bruto of texto.match(/-?\d+(?:[.,]\d+)?/g) ?? []) {
    const chave = chaveNumero(bruto);
    if (chave) achados.push(chave);
  }
  return achados;
}

/**
 * O que a consulta DEVOLVEU, em uma linha: nº de linhas e a soma de cada coluna
 * numérica. Vai no rodapé embaixo do SQL, pro dono confrontar com o que está
 * impresso no documento.
 *
 * Por que (2026-09-07 11:11): o relatório de 02/09 mostrou 3 vendas e
 * R$ 2.388,00, mas a consulta tinha devolvido 4 linhas somando R$ 3.582,00 —
 * um lead com 2 contratos, duplicado pelo JOIN. O Mentor deduplicou de cabeça e
 * acertou o número, só que ninguém consegue ver isso olhando o SQL sozinho.
 */
export function resumoDoResultado(texto: string): string | null {
  const abre = texto.indexOf("\n[");
  if (abre < 0) return null;
  const fecha = texto.lastIndexOf("]");
  if (fecha <= abre) return null;
  // deno-lint-ignore no-explicit-any
  let linhas: any[];
  try {
    linhas = JSON.parse(texto.slice(abre + 1, fecha + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(linhas) || linhas.length === 0) return "devolveu 0 linha";
  const somas: string[] = [];
  for (const col of Object.keys(linhas[0] ?? {})) {
    const nums = linhas.map((l) => chaveNumero(l?.[col])).filter((n): n is string => n !== null);
    if (nums.length !== linhas.length || nums.length === 0) continue;
    const total = nums.reduce((s, n) => s + Number(n), 0);
    somas.push(`soma de ${col} = ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }
  return `devolveu ${linhas.length} linha(s)` + (somas.length ? `; ${somas.slice(0, 4).join("; ")}` : "");
}

/**
 * O gráfico fecha com o card? Soma as barras e procura um KPI que bata.
 *
 * Caso real (2026-09-07 11:29): o relatório de agosto trouxe 13 dias na consulta
 * e 12 barras no desenho — a 13ª foi cortada em silêncio pelo teto. O gráfico
 * somava R$ 38.208,00 e o card "Faturamento" dizia R$ 39.999,00. Duas verdades
 * no mesmo papel, nenhuma delas sinalizada.
 *
 * Só acusa quando existe um KPI da MESMA ordem de grandeza (entre 0,5× e 2× da
 * soma) e nenhum KPI bate — assim "59 vendas" ao lado de R$ 38.208 não vira
 * alarme falso.
 */
// deno-lint-ignore no-explicit-any
export function graficoQueNaoFecha(secoes: any[]): string[] {
  const kpis: { rotulo: string; valor: string; n: number }[] = [];
  for (const s of secoes) {
    if (String(s?.tipo) !== "kpis") continue;
    for (const i of Array.isArray(s?.itens) ? s.itens : []) {
      const chave = chaveNumero(i?.valor);
      if (chave) kpis.push({ rotulo: String(i?.rotulo ?? ""), valor: String(i?.valor ?? ""), n: Number(chave) });
    }
  }
  if (kpis.length === 0) return [];

  const avisos: string[] = [];
  for (const s of secoes) {
    if (String(s?.tipo) !== "grafico_barras") continue;
    const barras = (Array.isArray(s?.itens) ? s.itens : [])
      .map((i: { valor?: unknown }) => chaveNumero(i?.valor))
      .filter((c: string | null): c is string => c !== null)
      .map(Number);
    if (barras.length === 0) continue;
    const soma = barras.reduce((a: number, b: number) => a + b, 0);
    if (soma <= 0) continue;
    if (kpis.some((k) => Math.abs(k.n - soma) < 0.01)) continue;
    const parecido = kpis.find((k) => k.n >= soma * 0.5 && k.n <= soma * 2);
    if (!parecido) continue;
    const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    avisos.push(
      `o gráfico "${String(s?.titulo ?? "sem título")}" soma ${fmt(soma)} nas ${barras.length} barras, ` +
        `mas o indicador "${parecido.rotulo}" diz ${parecido.valor} — um dos dois não conta a mesma coisa`,
    );
  }
  return avisos;
}

/**
 * Números escritos nas seções numéricas do PDF que NENHUMA consulta do turno
 * devolveu. Vira aviso no rodapé de apuração (2026-09-07): o rodapé já mostrava
 * o SQL, mas não dizia se o número impresso saiu daquele SQL. Só KPI e barra de
 * gráfico entram — tabela é cópia direta de linha, e o SQL ao lado já basta.
 */
// deno-lint-ignore no-explicit-any
export function numerosSemLastro(secoes: any[], consultados: Set<string>): string[] {
  const soltos = new Set<string>();
  for (const s of secoes) {
    const tipo = String(s?.tipo ?? "");
    if (tipo !== "kpis" && tipo !== "grafico_barras") continue;
    for (const item of Array.isArray(s?.itens) ? s.itens : []) {
      const escrito = String(item?.valor ?? "").trim();
      const chave = chaveNumero(escrito);
      // Sem número legível (ex.: "n/d") não é lastro faltando, é texto.
      if (!chave || consultados.has(chave)) continue;
      soltos.add(escrito);
    }
  }
  return [...soltos].slice(0, 12);
}

/**
 * Processa uma mensagem do canal INTERNO (dono logado no commandbar).
 *
 * Fluxo:
 *   1. Verifica conversa pertence ao userId.
 *   2. Insere mensagem do user em mentor_mensagens.
 *   3. Carrega histórico + higiene de alternância (igual original).
 *   4. Determina cargo (tipologiaEfetiva = ehAdmin ? 'admin' : 'mentor').
 *   5. Monta system prompt: MOLDE_FORMATO + cargo do banco.
 *   6. executarTool = tools-mentor + interceptação de recall_entidade.
 *   7. Loop chamarLlmComTools (TOOLS_MENTOR + recall_entidade, max_iter=3).
 *   8. Persiste assistant em mentor_mensagens + atualiza mentor_conversas.
 *   9. Retorna {ok, mensagem, tool_calls}.
 */
export async function processarCanalInterno(
  args: ArgsCanalInterno,
  deps?: CanalInternoDeps,
): Promise<ResultadoCanalInterno> {
  const {
    mensagem,
    conversaId,
    userId,
    ehAdmin,
    tenantId,
    canal = "mentor",
    contextoAba = null,
    tenantImpersonadoId = null,
    modeloOverride = null,
    documentoTurnoId = null,
    origemTurno = null,
    autorTurno = null,
  } = args;

  // ── Resolver deps (DI ou import lazy) ────────────────────────────────────
  const admin: AnyClient = deps?.supabaseAdmin ??
    (await import("./supabase.ts")).criarClienteAdmin();

  const chamarLlm = deps?.chamarLlm ??
    (await import("./openrouter.ts")).chamarLlmComTools;

  // ── 1. Verifica conversa (owner) ──────────────────────────────────────────
  const { data: conversa, error: convError } = await admin
    .from("mentor_conversas")
    .select("id")
    .eq("id", conversaId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (convError || !conversa) {
    return {
      ok: false,
      status: 404,
      erro: "Conversa não encontrada ou sem permissão.",
      mensagem: "",
      tool_calls: [],
    };
  }

  // ── 2. Insere mensagem do user ────────────────────────────────────────────
  await admin.from("mentor_mensagens").insert({
    conversa_id: conversaId,
    papel: "user",
    conteudo: mensagem.trim(),
  });

  // ── 3. Carrega histórico + higiene (idêntica ao original) ─────────────────
  // Fix 2026-05-28: ordena DESC + reverse pra pegar as MAIS RECENTES (inclui a
  // msg do user recém-inserida acima). Antes era ASC + limit(20) e quando a
  // conversa passava de 20 msgs a pergunta atual ficava fora da janela —
  // histórico chegava ao LLM terminando em assistant, Gemini devolvia "".
  const { data: historicoRaw } = await admin
    .from("mentor_mensagens")
    .select("papel, conteudo")
    .eq("conversa_id", conversaId)
    .order("criado_em", { ascending: false })
    .limit(MAX_HISTORICO);

  const historico = (historicoRaw ?? []).slice().reverse();

  // Higiene: sem conteúdo vazio; alternância estrita user/assistant;
  // descarta até 1ª 'user' (Gemini engasga senão).
  // deno-lint-ignore no-explicit-any
  const histLimpo: Array<{ role: "user" | "assistant"; content: string }> = ((historico as any[]) ?? [])
    .filter((m) => typeof m.conteudo === "string" && m.conteudo.trim() !== "")
    .map((m) => ({
      role: (m.papel === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.conteudo as string,
    }));

  const histAlternado: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of histLimpo) {
    const ult = histAlternado[histAlternado.length - 1];
    if (ult && ult.role === msg.role) {
      histAlternado[histAlternado.length - 1] = msg; // papel repetido: mantém mais recente
    } else {
      histAlternado.push(msg);
    }
  }
  while (histAlternado.length > 0 && histAlternado[0].role !== "user") {
    histAlternado.shift(); // exige 1ª msg 'user' após system
  }

  // ── 4. Cargo RAG-first ─────────────────────────────────────────────────
  // canal='curadoria' (Onda 2C.8): força cargo "Curadoria" global. Resto do
  // fluxo (Mentor/Admin do tenant via ehAdmin) preservado byte-equivalente.
  let cargo: { nome: string; objetivo_principal: string | null; regras_livres: string | null } | null = null;
  if (canal === "financeiro") {
    const { data } = await admin
      .from("cargos")
      .select("nome, objetivo_principal, regras_livres")
      .eq("nome", "Financeiro")
      .eq("tipologia", "mentor")
      .eq("escopo", "global")
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    cargo = data ?? null;
    // Árvore de categorias do tenant entra nas regras do turno (RAG-first: o
    // catálogo vem do banco; o agente encaixa na subcategoria ou usa gerenciar_categoria).
    if (cargo) {
      try {
        const { carregarArvoreCategorias, catalogoCategoriasTexto } = await import("./categorias-financeiro.ts");
        const catalogo = catalogoCategoriasTexto(await carregarArvoreCategorias(admin, tenantId));
        if (catalogo) {
          cargo = {
            ...cargo,
            regras_livres: `${cargo.regras_livres ?? ""}\nCATEGORIAS DO CAIXA (encaixe cada lançamento na subcategoria mais específica; nada encaixa → crie subcategoria via gerenciar_categoria): ${catalogo}`,
          };
        }
      } catch { /* catálogo é enriquecimento — falha não bloqueia o turno */ }
    }
  } else if (canal === "rifas") {
    // Bricio (2026-09-06): agente dedicado ao app Rifas. Tipologia própria pra não
    // disputar o slot do Mentor generalista — a mente dele mora 100% no cargo.
    const { data } = await admin
      .from("cargos")
      .select("nome, objetivo_principal, regras_livres")
      .eq("tipologia", "rifas")
      .eq("escopo", "global")
      .eq("ativo", true)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();
    cargo = data ?? null;
  } else if (canal === "curadoria") {
    const { data } = await admin
      .from("cargos")
      .select("nome, objetivo_principal, regras_livres")
      .eq("nome", "Curadoria")
      .eq("tipologia", "admin")
      .eq("escopo", "global")
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    cargo = data ?? null;
  } else {
    const tipologiaEfetiva: "admin" | "mentor" = ehAdmin ? "admin" : "mentor";
    const { data } = await admin
      .from("cargos")
      .select("nome, objetivo_principal, regras_livres")
      .eq("tipologia", tipologiaEfetiva)
      .eq("escopo", "global")
      .eq("ativo", true)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();
    cargo = data ?? null;
  }

  // ── 5. System prompt (MOLDE_FORMATO + cargo do banco + memória do dono) ───
  // Tijolo 3 CommandBar: fatos duráveis extraídos de turnos anteriores voltam
  // como contexto — é o que faz o commandbar "conhecer" o dono com o tempo.
  let memoriaDono = "";
  if (canal === "mentor") {
    try {
      const { recuperarMemoriaDono } = await import("./memoria-dono.ts");
      memoriaDono = await recuperarMemoriaDono(admin, userId, mensagem);
    } catch (e) {
      console.warn("[canal-interno] recall memoria_dono falhou:", (e as Error).message);
    }
  }
  // Data de hoje em BRT no prompt (2026-09-16). Sem isso o modelo usa o ano do próprio
  // treinamento: em 16/09/2026 o Mentor do Diego filtrou `created_at >= '2024-08-01'`,
  // recebeu zero linha, refez com `EXTRACT(MONTH)=8` (sem ano nenhum) e estourou as 6
  // rodadas — o dono recebeu "executei as ações, mas não consegui redigir o fechamento".
  const blocoTemporal = blocoTemporalBRT();
  const sistemaPromptBase = cargo?.objetivo_principal
    ? `${MOLDE_FORMATO}\n\n${blocoTemporal}\n\nCargo ativo: "${cargo.nome}". Objetivo: ${cargo.objetivo_principal}${
        cargo.regras_livres ? `\nRegras do tenant: ${cargo.regras_livres}` : ""
      }`
    : `${MOLDE_FORMATO}\n\n${blocoTemporal}`;
  // Custo do Mentor (2026-08-27): memoriaDono NÃO entra no mesmo bloco cacheado
  // de sistemaPromptBase — ela muda de turno a turno (recall de fatos novos), e
  // misturar as duas quebrava o cache_control do bloco inteiro (medido em
  // produção: tokens_cached=0 nas 6 primeiras chamadas pós-deploy). Vira uma
  // 2ª mensagem "system" à parte, sem cache — igual ao histórico.

  // ── 6. executarTool = tools-mentor + interceptação recall_entidade ────────
  // deno-lint-ignore no-explicit-any
  const executarToolComRecall = async (nome: string, toolArgs: Record<string, unknown>): Promise<string> => {
    if (nome === "recall_entidade") {
      const termo = String(toolArgs.nome ?? "");

      // Resolver recall dep (DI ou import lazy)
      let recallFn = deps?.recall;
      if (!recallFn) {
        const { resolverEntidadePorNome, recuperarMemoriaLead } = await import("./recall-memoria.ts");
        recallFn = async (
          adminInner: AnyClient,
          params: { tenantId: string; termo: string; leadId?: string | null; queryRecall?: string },
        ) => {
          const resolucao = await resolverEntidadePorNome(adminInner, { tenantId: params.tenantId, termo: params.termo });
          if (resolucao.status === "nenhum") {
            return { status: "nenhum" as const, entidades: [], fatosLead: [], episodios: [] };
          }
          if (resolucao.status === "ambiguo") {
            return { status: "ambiguo" as const, entidades: resolucao.entidades, fatosLead: [], episodios: [] };
          }
          // status === 'unico'
          const leadId = resolucao.entidades[0]?.id ?? null;
          const memoria = await recuperarMemoriaLead(adminInner, {
            leadId,
            tenantId: params.tenantId,
            queryRecall: params.queryRecall ?? params.termo,
          });
          return {
            status: "unico" as const,
            entidades: resolucao.entidades,
            fatosLead: memoria.fatosLead,
            episodios: memoria.episodios,
          };
        };
      }

      const resultado = await recallFn(admin, { tenantId, termo, queryRecall: mensagem });

      if (resultado.status === "nenhum") {
        return `Não encontrei ninguém com o nome "${termo}" na base.`;
      }
      if (resultado.status === "ambiguo") {
        const nomes = resultado.entidades
          // deno-lint-ignore no-explicit-any
          .map((e: any) => e.name || e.nome_exibicao || e.id)
          .join(", ");
        return `Encontrei ${resultado.entidades.length} pessoas com esse nome: ${nomes}. Qual delas você quer consultar?`;
      }
      // unico
      // deno-lint-ignore no-explicit-any
      const ent = resultado.entidades[0] as any;
      const partes: string[] = [];
      partes.push(`Lead: ${ent.name || ent.nome_exibicao || ent.id}`);
      if (ent.phone) partes.push(`Telefone: ${ent.phone}`);
      // deno-lint-ignore no-explicit-any
      if (resultado.fatosLead?.length) partes.push(`Fatos: ${resultado.fatosLead.map((f: any) => f.fato ?? JSON.stringify(f)).join("; ")}`);
      // deno-lint-ignore no-explicit-any
      if (resultado.episodios?.length) partes.push(`Episódios: ${resultado.episodios.map((e: any) => e.episodio_resumo ?? JSON.stringify(e)).join("; ")}`);
      return partes.join("\n");
    }

    // App Rifas (2026-09-06): o dono controla o app inteiro pela conversa com o
    // Mentor. Handlers moram em `tools-rifas*.ts` e retornam objeto — a ponte
    // `tools-rifas-mentor.ts` converte pro contrato de string do canal interno.
    const { NOMES_TOOLS_RIFA, executarToolRifa } = await import("./tools-rifas-mentor.ts");
    if (NOMES_TOOLS_RIFA.includes(nome)) {
      return await executarToolRifa(nome, toolArgs, {
        tenant_id: tenantId,
        supabase_admin: admin,
        conversa_id: conversaId,
      });
    }

    // Campanha pela barra (bloco 2, 2026-09-16): público → cartão → ok → criar.
    // Tenant efetivo (não o membro da equipe): a campanha é da conta.
    const { NOMES_TOOLS_CAMPANHA, executarToolCampanha } = await import("./tools-campanha.ts");
    if ((NOMES_TOOLS_CAMPANHA as readonly string[]).includes(nome)) {
      return await executarToolCampanha(nome, toolArgs, {
        tenant_id: tenantImpersonadoId ?? tenantId,
        user_id: userId,
        supabase_admin: admin,
        conversa_id: conversaId,
      });
    }

    // Demais tools → delega pra tools-mentor
    const { executarTool: executarToolMentor } = await import("./tools-mentor.ts");
    // conversa_id: o gate de 2 turnos da exclusão (excluir_dados) precisa dele.
    // deno-lint-ignore no-explicit-any
    const ctx: any = { user_id: userId, supabase_admin: admin, conversa_id: conversaId };
    return await executarToolMentor(nome, toolArgs, ctx);
  };

  // ── 7. Catálogo de ferramentas por cargo + ferramentas de ação semântica (rag://) ──
  // Resolve o catálogo de handlers determinísticos conforme o canal/cargo:
  //   canal='curadoria' -> TOOLS_CURADORIA ; ehAdmin -> TOOLS_ADMIN ; senão Mentor.
  // Depois carrega cargo_ferramentas do cargo resolvido trazendo endpoint_url + schema_zod,
  // pra ligar as ferramentas de AÇÃO SEMÂNTICA (endpoint 'rag://<busca_hibrida_X>') do banco.
  // O mesmo cano (tools-rag.ts) vale pros 3 cargos internos e pro motor externo.
  const { rpcDoEndpoint } = await import("./tools-rag.ts");

  // deno-lint-ignore no-explicit-any
  let toolsHandlers: any[] = [];
  let executarToolBase: (nome: string, toolArgs: Record<string, unknown>) => Promise<string>;
  let cargoCatalogoId: string | null = null;
  let incluiRecall = false;

  if (canal === "financeiro") {
    const { TOOLS_FINANCEIRO, executarTool: execFin } = await import("./tools-financeiro.ts");
    // deno-lint-ignore no-explicit-any
    toolsHandlers = TOOLS_FINANCEIRO as unknown as any[];
    executarToolBase = (nome, toolArgs) =>
      execFin(nome, toolArgs, {
        user_id: tenantId,
        supabase_admin: admin,
        documento_turno_id: documentoTurnoId,
        origem_turno: origemTurno,
        autor_turno: autorTurno,
      });
    const { data } = await admin.from("cargos").select("id")
      .eq("nome", "Financeiro").eq("tipologia", "mentor").eq("escopo", "global").eq("ativo", true)
      .limit(1).maybeSingle();
    cargoCatalogoId = (data?.id as string | undefined) ?? null;
  } else if (canal === "rifas") {
    // Bricio carrega SÓ as tools de rifa — é o ponto do agente dedicado: menos
    // tool na mesa, menos chance de errar a escolha. Schema vem do banco, igual
    // ao Mentor; se a catraca do app estiver fechada, volta vazio e ele avisa
    // que o app não está ligado em vez de fingir que consultou.
    const { carregarToolsRifaMentor, executarToolRifa } = await import("./tools-rifas-mentor.ts");
    // deno-lint-ignore no-explicit-any
    toolsHandlers = (await carregarToolsRifaMentor(admin, tenantId)) as unknown as any[];
    executarToolBase = (nome, toolArgs) =>
      executarToolRifa(nome, toolArgs, {
        tenant_id: tenantId,
        supabase_admin: admin,
        conversa_id: conversaId,
      });
    const { data } = await admin.from("cargos").select("id")
      .eq("tipologia", "rifas").eq("escopo", "global").eq("ativo", true)
      .order("ordem", { ascending: true }).limit(1).maybeSingle();
    cargoCatalogoId = (data?.id as string | undefined) ?? null;
  } else if (canal === "curadoria") {
    const { TOOLS_CURADORIA, executarTool: execCur } = await import("./tools-curadoria.ts");
    // deno-lint-ignore no-explicit-any
    toolsHandlers = TOOLS_CURADORIA as unknown as any[];
    executarToolBase = (nome, toolArgs) =>
      execCur(nome, toolArgs, {
        user_id: userId,
        supabase_admin: admin,
        contexto_aba: contextoAba,
        tenant_impersonado_id: tenantImpersonadoId,
        nicho_impersonado_id: null,
      });
    const { data } = await admin.from("cargos").select("id")
      .eq("nome", "Curadoria").eq("tipologia", "admin").eq("escopo", "global").eq("ativo", true)
      .limit(1).maybeSingle();
    cargoCatalogoId = (data?.id as string | undefined) ?? null;
  } else if (ehAdmin) {
    const { TOOLS_ADMIN, executarTool: execAdmin } = await import("./tools-admin.ts");
    // deno-lint-ignore no-explicit-any
    toolsHandlers = TOOLS_ADMIN as unknown as any[];
    executarToolBase = (nome, toolArgs) =>
      execAdmin(nome, toolArgs, {
        user_id: userId,
        supabase_admin: admin,
        tenant_impersonado_id: tenantImpersonadoId,
        conversa_id: conversaId,
      });
    const { data } = await admin.from("cargos").select("id")
      .eq("tipologia", "admin").eq("escopo", "global").eq("ativo", true)
      .order("ordem", { ascending: true }).limit(1).maybeSingle();
    cargoCatalogoId = (data?.id as string | undefined) ?? null;
  } else {
    const { TOOLS_MENTOR } = await import("./tools-mentor.ts");
    // App Rifas: entra no catálogo do Mentor só quando o tenant tem o app
    // (instalado + toggle). Schema vem do banco — mesma linha que o motor
    // externo lê, pra descrição não divergir entre os dois canais.
    const { carregarToolsRifaMentor } = await import("./tools-rifas-mentor.ts");
    const toolsRifa = await carregarToolsRifaMentor(admin, tenantId);
    // Campanha pela barra (bloco 2, 2026-09-16): 4 tools, schema em código +
    // linha em ferramentas_dinamicas (seleção semântica) + vínculo nos cargos.
    const { TOOLS_CAMPANHA } = await import("./tools-campanha.ts");
    // deno-lint-ignore no-explicit-any
    toolsHandlers = [...(TOOLS_MENTOR as unknown as any[]), ...toolsRifa, ...(TOOLS_CAMPANHA as unknown as any[])];
    executarToolBase = executarToolComRecall;
    incluiRecall = true;
    const r = await admin.from("cargos").select("id")
      .eq("tipologia", "mentor").eq("ativo", true)
      .eq("escopo", "tenant").eq("tenant_id", tenantId).limit(1).maybeSingle();
    cargoCatalogoId = (r.data?.id as string | undefined) ?? null;
    if (!cargoCatalogoId) {
      const g = await admin.from("cargos").select("id")
        .eq("tipologia", "mentor").eq("ativo", true).eq("escopo", "global").limit(1).maybeSingle();
      cargoCatalogoId = (g.data?.id as string | undefined) ?? null;
    }
  }

  // ── Trava anti-número-inventado no PDF (Theus 2026-08-11) ─────────────────
  // O roteiro do PDF vem da LLM. Sem consulta REAL neste turno, KPI/tabela/
  // gráfico é chute de memória — e o dono recebe número irreal sem saber.
  // Documento com seção numérica só executa se consultar_dados ou mostrar_kpi
  // rodou COM SUCESSO antes, no mesmo turno. PDF só-texto passa livre.
  const TOOLS_DE_DADOS = new Set(["consultar_dados", "mostrar_kpi"]);
  const SECOES_NUMERICAS = new Set(["kpis", "tabela", "grafico_barras"]);
  let consultouDadosNoTurno = false;
  // Como o número foi apurado neste turno — SQL + o que cada consulta devolveu.
  // Alimenta a conferência do documento (ver abaixo). Não sai no PDF.
  const apuracaoDoTurno: string[] = [];
  // Números que as consultas do turno de fato devolveram. Serve pra apontar o
  // número que o Mentor escreveu mas nenhuma consulta trouxe. Não recusa —
  // número derivado (soma, média, %) é legítimo; o que não pode é passar batido.
  const numerosConsultados = new Set<string>();
  const executarToolSemVigia = executarToolBase;
  executarToolBase = async (nome, toolArgs) => {
    if (nome === "gerar_documento_pdf" && !consultouDadosNoTurno) {
      const secoes = Array.isArray(toolArgs?.secoes) ? toolArgs.secoes : [];
      // deno-lint-ignore no-explicit-any
      const temNumero = secoes.some((s: any) => SECOES_NUMERICAS.has(String(s?.tipo)));
      if (temNumero) {
        return "✗ Documento com números recusado: nenhuma consulta real foi feita neste turno. " +
          "Chame consultar_dados (ou mostrar_kpi) AGORA e monte o PDF copiando os números EXATOS " +
          "que a consulta retornar — sem arredondar, sem completar de memória, sem estimar.";
      }
    }

    // Conferência do documento (Theus 2026-09-07). A trava acima só garante que
    // ALGUMA consulta rodou — não que ela responde o que foi pedido, nem que o
    // número impresso saiu dela. Ela pegou dois erros reais no mesmo dia: o
    // SELECT com `OR` entre datas de tabelas diferentes, e o gráfico de agosto
    // que somava R$ 38.208 ao lado de um card de R$ 39.999.
    //
    // Até a v257 isso virava uma seção "Como estes números foram apurados" no
    // fim do PDF, com o SQL cru. Theus cortou: o relatório vai pro cliente dele
    // e SQL no papel parece cabeçalho de HTML. A conferência continua — vai no
    // RESULTADO da tool, que só o Mentor lê, pra ele avisar na conversa.
    const conferencia: string[] = [];
    if (nome === "gerar_documento_pdf") {
      const secoes = Array.isArray(toolArgs?.secoes) ? toolArgs.secoes : [];
      // deno-lint-ignore no-explicit-any
      const temNumero = secoes.some((s: any) => SECOES_NUMERICAS.has(String(s?.tipo)));
      if (temNumero) {
        const soltos = numerosSemLastro(secoes, numerosConsultados);
        const naoFecha = graficoQueNaoFecha(secoes);
        if (soltos.length > 0) {
          conferencia.push(
            `Números que você escreveu e NENHUMA consulta deste turno devolveu: ${soltos.join(", ")}.` +
              " Se foi conta sua (soma, média, %), diga isso ao dono na resposta; se foi engano," +
              " refaça o documento com o número da consulta.",
          );
        }
        if (naoFecha.length > 0) conferencia.push(`${naoFecha.join("; ")}.`);
        if (conferencia.length > 0) {
          conferencia.push(
            "Consultas do turno: " + apuracaoDoTurno.map((a) => a.split("\n→ ")[1] ?? "?").join(" | "),
          );
        }
      }
    }

    const resultado = await executarToolSemVigia(nome, toolArgs);
    if (conferencia.length > 0 && !String(resultado).startsWith("✗")) {
      return `${resultado}\n\n⚠ CONFERÊNCIA DO DOCUMENTO (não vai no PDF — avise o dono na sua resposta): ${conferencia.join(" ")}`;
    }
    if (TOOLS_DE_DADOS.has(nome) && !String(resultado).startsWith("✗")) {
      consultouDadosNoTurno = true;
      for (const n of numerosDoTexto(String(resultado))) numerosConsultados.add(n);
      const sql = typeof toolArgs?.sql === "string" ? toolArgs.sql.trim() : "";
      if (nome === "consultar_dados" && sql) {
        const resumo = resumoDoResultado(String(resultado));
        apuracaoDoTurno.push(
          (sql.length > 1200 ? sql.slice(0, 1200) + " […]" : sql) +
            (resumo ? `\n→ ${resumo}` : ""),
        );
      } else if (nome === "mostrar_kpi") {
        const met = String(toolArgs?.metrica ?? "");
        const per = String(toolArgs?.periodo ?? "30d");
        if (met) apuracaoDoTurno.push(`mostrar_kpi — métrica ${met}, período ${per}`);
      }
    }
    return resultado;
  };

  // Carrega cargo_ferramentas do cargo resolvido (nome + descrição + endpoint + schema; só ativas)
  // deno-lint-ignore no-explicit-any
  let ferramentasBanco: any[] = [];
  if (cargoCatalogoId) {
    const { data } = await admin
      .from("cargo_ferramentas")
      .select("ordem, ferramentas_dinamicas!inner(nome_tool, descricao, schema_zod, endpoint_url, ativo)")
      .eq("cargo_id", cargoCatalogoId)
      .order("ordem", { ascending: true });
    // deno-lint-ignore no-explicit-any
    ferramentasBanco = (data ?? []).map((v: any) => v.ferramentas_dinamicas).filter((f: any) => f?.ativo);
  }

  // Handlers determinísticos: respeita a marcação do cargo SE ela intersecta o catálogo;
  // senão usa o catálogo cheio (evita cargo sem nenhuma ferramenta por marcação órfã).
  const nomesMarcados = new Set(ferramentasBanco.map((f) => String(f.nome_tool)));
  // deno-lint-ignore no-explicit-any
  const interHandlers = toolsHandlers.filter((t: any) => nomesMarcados.has(t.function.name));
  const baseHandlers = (nomesMarcados.size > 0 && interHandlers.length > 0) ? interHandlers : toolsHandlers;

  // Ferramentas de AÇÃO SEMÂNTICA (rag://) — schema vem do banco; despacho via tools-rag.
  const mapaRag = new Map<string, string>();
  // deno-lint-ignore no-explicit-any
  const toolsRag: any[] = [];
  for (const f of ferramentasBanco) {
    const rpc = rpcDoEndpoint(f.endpoint_url);
    if (!rpc) continue;
    mapaRag.set(String(f.nome_tool), rpc);
    toolsRag.push({
      type: "function",
      function: {
        name: String(f.nome_tool),
        description: String(f.descricao ?? ""),
        parameters: f.schema_zod ?? { type: "object", properties: {} },
      },
    });
  }

  // deno-lint-ignore no-explicit-any
  let toolsCompletas: any[] = [...baseHandlers, ...toolsRag];
  if (incluiRecall) toolsCompletas = [...toolsCompletas, SCHEMA_RECALL_ENTIDADE];

  // ── 7.5 Seleção semântica do catálogo (2026-08-12) ────────────────────────
  // Medição de 101 chamadas reais: a rodada 0 do Mentor gastava 6.237 tokens de
  // entrada com um system prompt de ~900 — os outros ~5.300 eram as 20 definições
  // de ferramentas. O cardápio inteiro ia em TODA rodada, 3,74 vezes por turno.
  //
  // O ranqueador já existia pronto e desligado em tools-rag.ts ("Técnica 2").
  // Aqui ele passa a escolher, pela pergunta do turno, quais ferramentas valem
  // a viagem. Três garantias pra nunca deixar o agente sem braço:
  //   1. PISO — ferramentas que qualquer pedido pode precisar entram sempre.
  //   2. Ferramenta sem vetor não pode ser julgada, então entra sempre também
  //      (cortar em silêncio o que não dá pra ranquear seria mutilar às cegas).
  //   3. Qualquer falha (sem embedding, RPC fora, retorno vazio) → catálogo cheio.
  const PISO_FERRAMENTAS = new Set([
    "consultar_dados", // canivete universal de leitura
    "recall_entidade", // "como tá o João?"
    "abrir_app",
    "abrir_app_os",
  ]);
  const TOP_K_FERRAMENTAS = 10;
  const MIN_CATALOGO_PRA_RANQUEAR = 12;

  // deno-lint-ignore no-explicit-any
  const envDeno = (globalThis as any).Deno?.env; // fora do Deno (tsx/node nos testes) não ranqueia
  if (
    envDeno &&
    envDeno.get("USAR_SELECAO_FERRAMENTAS") !== "false" &&
    toolsCompletas.length >= MIN_CATALOGO_PRA_RANQUEAR &&
    mensagem.trim().length > 0
  ) {
    try {
      const { selecionarFerramentasPorSimilaridade } = await import("./tools-rag.ts");
      const nomesCatalogo = toolsCompletas.map((t) => String(t.function.name));
      // top_k = catálogo inteiro: o corte é feito aqui, e o que não voltar do
      // ranking é justamente o que não tem vetor (garantia 2).
      const ranking = await selecionarFerramentasPorSimilaridade(
        admin,
        mensagem,
        nomesCatalogo.length,
        null,
        nomesCatalogo,
      );
      if (ranking && ranking.length > 0) {
        const ranqueadas = new Set(ranking);
        const manter = new Set<string>([
          ...ranking.slice(0, TOP_K_FERRAMENTAS),
          ...nomesCatalogo.filter((n) => !ranqueadas.has(n) || PISO_FERRAMENTAS.has(n)),
        ]);
        const enxuto = toolsCompletas.filter((t) => manter.has(String(t.function.name)));
        if (enxuto.length > 0 && enxuto.length < toolsCompletas.length) {
          console.log(
            `[canal-interno] catálogo ${toolsCompletas.length} → ${enxuto.length} ferramentas (top-${TOP_K_FERRAMENTAS} semântico)`,
          );
          toolsCompletas = enxuto;
        }
      }
    } catch (e) {
      // Enxugar é otimização — falhar aqui nunca pode derrubar o turno.
      console.warn("[canal-interno] seleção semântica de ferramentas falhou:", (e as Error).message);
    }
  }

  // Despacho final: ferramenta rag:// -> tools-rag genérico ; senão -> handler do catálogo do cargo.
  const executarToolFinal = async (nome: string, toolArgs: Record<string, unknown>): Promise<string> => {
    // Nível de permissão: escrita/exclusão é privilégio do dono da conta.
    // userId ≠ tenant efetivo = sub-usuário da equipe → só leitura.
    const tenantEfetivo = tenantImpersonadoId ?? tenantId;
    if (TOOLS_ESCRITA_SO_DONO.has(nome) && !ehAdmin && userId !== tenantEfetivo) {
      return JSON.stringify({
        ok: false,
        erro: "sem_permissao",
        mensagem: "Essa ação altera dados da conta e só o dono pode executar. Peça ao titular da conta.",
      });
    }
    const rpcRag = mapaRag.get(nome);
    if (rpcRag) {
      const { despacharToolRag } = await import("./tools-rag.ts");
      return await despacharToolRag(admin, rpcRag, toolArgs, {
        tenant_id: tenantImpersonadoId ?? tenantId,
        nicho_id: null,
        agente_id: null,
        lead_id: null,
      });
    }
    return await executarToolBase(nome, toolArgs);
  }

  // ── 8. Loop LLM ──────────────────────────────────────────────────────────
  // Modelo: override do usuário (SeletorLlm) > config viva do canal > fallback.
  // getConfigChamada devolve DEFAULTS.sintese quando a chave não existe, então só
  // aceitamos a config se ela for MESMO a do canal pedido — sem essa checagem um
  // canal sem linha no banco (financeiro, admin) seria silenciosamente rebaixado
  // pro modelo da síntese.
  let modeloDaConfig: string | null = null;
  if (!modeloOverride) {
    try {
      const { getConfigChamada } = await import("./config-chamadas.ts");
      const chaveConfig = `canal_${canal}`;
      const cfg = await getConfigChamada(admin, chaveConfig, tenantId ?? null, null);
      if (cfg?.chave === chaveConfig && cfg.ativo && cfg.modelo) modeloDaConfig = cfg.modelo;
    } catch (e) {
      console.warn("[canal-interno] config de modelo falhou, usando fallback:", (e as Error).message);
    }
  }

  // O Bricio (canal `rifas`) tinha um desvio de gateway pro OmniRoute self-hosted,
  // que rotacionava provedor grátis. Removido em 2026-09-07: o OmniRoute rodava em
  // container na máquina do Theus e a edge de produção nunca enxergou aquele host —
  // o desvio só existia no stack local. Agora todo canal fala direto com o
  // OpenRouter, e o que separa o Bricio dos outros é o MODELO: `canal_rifas` em
  // `config_chamadas_llm` aponta pra uma LLM básica, lida logo acima.
  // ── 8.3 Ficha da Empresa — camada fato (bloco 5a, 2026-09-16) ─────────────
  // O Mentor chega sabendo os números do negócio (RPC `ler_empresa`, calculada na
  // hora, nada copiado). Só canal `mentor`. Kill-switch USAR_FICHA_EMPRESA=false.
  let trechoFicha = "";
  if (canal === "mentor" && tenantId && envDeno?.get("USAR_FICHA_EMPRESA") !== "false") {
    try {
      const { data: ficha } = await admin.rpc("ler_empresa", { p_tenant_id: tenantImpersonadoId ?? tenantId });
      if (ficha && typeof ficha === "object") {
        const f = ficha as Record<string, unknown>;
        const n = (o: unknown, k: string) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined);
        const brl = (v: unknown) => `R$ ${Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
        const emp = f.empresa as Record<string, unknown> | null;
        trechoFicha = [
          "<ficha_da_empresa>",
          "Números REAIS do negócio do dono, calculados agora do banco. Use-os direto quando a pergunta for sobre a empresa; não chame ferramenta pra reobter o mesmo número. Nunca invente o que não está aqui.",
          emp?.nome ? `Empresa: ${emp.nome}${emp.cidade ? ` (${emp.cidade}/${emp.estado ?? ""})` : ""}${f.nicho ? ` · nicho ${f.nicho}` : ""}` : null,
          `Equipe: ${f.equipe ?? 0} · produtos ativos: ${f.produtos_ativos ?? 0} · canais WhatsApp: ${f.canais_whatsapp ?? 0}`,
          `Leads: ${n(f.leads, "total")} no total, ${n(f.leads, "na_base")} na Base, ${n(f.leads, "quentes")} quentes, ${n(f.leads, "novos_hoje")} novos hoje, ${n(f.leads, "novos_7d")} em 7 dias, ${n(f.leads, "calados_7d")} calados há 7-30 dias, ${n(f.leads, "quentes_sem_resposta_24h")} quentes sem resposta há 24h, ${n(f.leads, "convertidos_mes")} convertidos no mês`,
          `Conversas ativas: ${n(f.conversas, "ativas")} · pedindo humano: ${n(f.conversas, "precisa_humano")}`,
          `Vendas do mês: ${n(f.vendas_mes, "pagos")} pagamentos = ${brl(n(f.vendas_mes, "valor_pago"))} · vencido a receber: ${brl(n(f.vendas_mes, "a_receber_vencido"))} · vence em 7 dias: ${brl(n(f.vendas_mes, "a_vencer_7d"))}`,
          `Contratos: ${n(f.contratos, "assinados_mes")} assinados no mês · ${n(f.contratos, "parados_7d")} sem assinar há 7+ dias`,
          `Campanhas ativas: ${n(f.campanhas, "ativas")} (${n(f.campanhas, "leads_na_esteira")} leads na esteira) · leads da Babel em 7 dias: ${f.leads_da_babel_7d ?? 0}`,
          "</ficha_da_empresa>",
        ].filter(Boolean).join("\n");
      }
    } catch (e) {
      console.warn("[canal-interno] ficha da empresa falhou, seguindo sem:", (e as Error).message);
    }
  }

  // ── 8.4 Gavetas de RAG do canal interno (bloco 1, 2026-09-16) ─────────────
  // O motor do lead lê 11 gavetas antes de falar; o canal interno lia zero. Só o
  // canal `mentor`: curadoria/financeiro/rifas têm cargos densos próprios. Entra
  // como 3ª mensagem `system`, fora do bloco cacheado (muda a cada pergunta).
  // Kill-switch: USAR_GAVETAS_INTERNO=false. Falha = "" e o turno segue.
  let trechoGavetas = "";
  if (canal === "mentor" && tenantId && envDeno?.get("USAR_GAVETAS_INTERNO") !== "false") {
    try {
      const { recuperarGavetasInterno } = await import("./gavetas-interno.ts");
      trechoGavetas = await recuperarGavetasInterno(admin, { pergunta: mensagem, tenantId });
    } catch (e) {
      console.warn("[canal-interno] gavetas falharam, seguindo sem:", (e as Error).message);
    }
  }

  // ── 8.5 Orçamento de LLM por tenant (bloco 0, 2026-09-16) ─────────────────
  // `pode_gastar_llm` lê o gasto do mês em logs_requisicao_llm.tenant_id contra o
  // teto em orcamento_llm_tenant. `economico` rebaixa o modelo pro degrau barato
  // (chave `canal_<canal>_economico` em config_chamadas_llm; sem linha, segue o
  // modelo normal); `bloqueado` devolve aviso sem chamar o modelo caro.
  // Nunca derruba o turno: qualquer falha = modo normal. Kill-switch:
  // USAR_ORCAMENTO_LLM=false.
  // Só o canal `mentor` de tenant comum entra no orçamento (auditoria 16/09): o
  // Admin (curadoria) e os canais financeiro/rifas têm cargo e custo próprios —
  // sem esta isenção o teto padrão bloqueava a curadoria do próprio Admin.
  let modoOrcamento: "normal" | "economico" | "bloqueado" = "normal";
  let modeloEconomico: string | null = null;
  const entraNoOrcamento = Boolean(tenantId) && !ehAdmin && canal === "mentor";
  if (entraNoOrcamento && envDeno?.get("USAR_ORCAMENTO_LLM") !== "false") {
    try {
      const { data: orc } = await admin.rpc("pode_gastar_llm", { p_tenant_id: tenantId });
      const modo = (orc as { modo?: string } | null)?.modo;
      if (modo === "economico" || modo === "bloqueado") modoOrcamento = modo;
      if (modoOrcamento === "economico") {
        const { getConfigChamada } = await import("./config-chamadas.ts");
        const chaveEco = `canal_${canal}_economico`;
        const cfgEco = await getConfigChamada(admin, chaveEco, tenantId ?? null, null);
        if (cfgEco?.chave === chaveEco && cfgEco.ativo && cfgEco.modelo) modeloEconomico = cfgEco.modelo;
      }
      if (modoOrcamento !== "normal") {
        console.log(`[canal-interno] orçamento ${modoOrcamento} tenant=${tenantId} pct=${(orc as { pct?: number } | null)?.pct}`);
      }
    } catch (e) {
      console.warn("[canal-interno] orçamento falhou, seguindo normal:", (e as Error).message);
    }
  }
  if (modoOrcamento === "bloqueado") {
    const avisoBloqueio =
      "Seu limite de uso do Mentor deste mês acabou. Continuo respondendo o que já sei da " +
      "nossa conversa, e o limite volta no dia 1. Se precisar de mais agora, fale com o suporte.";
    await admin.from("mentor_mensagens").insert({
      conversa_id: conversaId, papel: "assistant", conteudo: avisoBloqueio, tool_calls: null,
    });
    await admin.from("mentor_conversas")
      .update({ atualizado_em: new Date().toISOString() }).eq("id", conversaId);
    return { ok: true, mensagem: avisoBloqueio, tool_calls: [] };
  }

  const resultado = await chamarLlm({
    modelo: modeloOverride ?? modeloEconomico ?? modeloDaConfig ?? MODELO_INTERNO,
    tenant_id: tenantId ?? null,
    metadata_log: { canal, orcamento: modoOrcamento },
    mensagens: [
      { role: "system", content: sistemaPromptBase },
      ...(memoriaDono ? [{ role: "system" as const, content: memoriaDono }] : []),
      ...(trechoFicha ? [{ role: "system" as const, content: trechoFicha }] : []),
      ...(trechoGavetas ? [{ role: "system" as const, content: trechoGavetas }] : []),
      ...histAlternado,
    ],
    // 6 rodadas (era 3): tarefa real de dono é multi-passo — consultar esquema,
    // achar o registro, alterar 2-3 lugares e ainda redigir a resposta. Com 3,
    // o turno do Carlos (2026-08-02) estourou no meio e ele viu "não consegui".
    tools: toolsCompletas,
    max_iter: 6,
    executarTool: executarToolFinal,
    tools_somente_leitura: TOOLS_SOMENTE_LEITURA,
    tipo_log: `canal_interno_${canal}`,
  });

  // ── 9. Persiste assistant ─────────────────────────────────────────────────
  // Seleção corrente da thread (bloco 2, 2026-09-16): além de nome+args, a bolha
  // guarda um RESUMO do que a tool devolveu (ids de leads, total, proposta).
  // É o que faz "tira esses que reclamaram" no turno seguinte apontar pra lista
  // certa — antes o retorno era descartado (auditoria 16/09).
  const { resumirResultadoTool } = await import("./tools-campanha.ts");
  const toolCallsParaGravar =
    resultado.tool_calls_executados.length > 0
      ? resultado.tool_calls_executados.map((tc) => {
          const resumo = typeof tc.resultado === "string" ? resumirResultadoTool(tc.nome, tc.resultado) : null;
          return { toolName: tc.nome, args: tc.args, ...(resumo ? { resultado_resumo: resumo } : {}) };
        })
      : null;

  await admin.from("mentor_mensagens").insert({
    conversa_id: conversaId,
    papel: "assistant",
    conteudo: resultado.texto_final,
    tool_calls: toolCallsParaGravar,
  });

  await admin
    .from("mentor_conversas")
    .update({ atualizado_em: new Date().toISOString() })
    .eq("id", conversaId);

  // ── 10. Memória evolutiva do dono (fora do caminho da resposta) ──────────
  if (canal === "mentor") {
    const { fireAndForget } = await import("./fire-and-forget.ts");
    const extracao = import("./memoria-dono.ts").then(({ extrairEGravarFatosDono }) =>
      extrairEGravarFatosDono(admin, chamarLlm, {
        ownerId: userId,
        conversaId,
        mensagemUser: mensagem,
        respostaMentor: resultado.texto_final,
      })
    );
    fireAndForget(extracao, "memoria-dono");
  }

  return {
    ok: true,
    mensagem: resultado.texto_final,
    tool_calls: resultado.tool_calls_executados,
  };
}
