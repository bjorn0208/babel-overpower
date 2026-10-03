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
  "instruções de sistema ou meta-comentários na resposta — só o conteúdo final.";

// Bug Diego 2026-05-18: a 3c.3 usava "google/gemini-3.1-flash-lite" — esse modelo
// + as 15 tools (TOOLS_MENTOR) no chamarLlmComTools devolvia content VAZIO sem
// tool-call → mentor_mensagens gravava "" → commandbar mostrava "…".
// Slug correto descoberto na API pública OpenRouter /api/v1/models: a única
// variante Gemini 3.1 com "custom tools" nativo (suporta tools + tool_choice,
// ctx ~1M) é a PRO — `google/gemini-3.1-pro-preview-customtools`. Cravado pelo
// Theus (canal interno usa Gemini 3.1 com custom tools; D2 segue valendo só p/
// a cascata do canal externo).
const MODELO_INTERNO = "google/gemini-3.1-pro-preview-customtools";
const MAX_HISTORICO = 20;

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
  canal?: "mentor" | "curadoria" | "financeiro";
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

  // ── 5. System prompt (MOLDE_FORMATO + cargo do banco) ─────────────────────
  const sistemaPrompt = cargo?.objetivo_principal
    ? `${MOLDE_FORMATO}\n\nCargo ativo: "${cargo.nome}". Objetivo: ${cargo.objetivo_principal}${
        cargo.regras_livres ? `\nRegras do tenant: ${cargo.regras_livres}` : ""
      }`
    : MOLDE_FORMATO;

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

    // Demais tools → delega pra tools-mentor
    const { executarTool: executarToolMentor } = await import("./tools-mentor.ts");
    // deno-lint-ignore no-explicit-any
    const ctx: any = { user_id: userId, supabase_admin: admin };
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
      });
    const { data } = await admin.from("cargos").select("id")
      .eq("tipologia", "admin").eq("escopo", "global").eq("ativo", true)
      .order("ordem", { ascending: true }).limit(1).maybeSingle();
    cargoCatalogoId = (data?.id as string | undefined) ?? null;
  } else {
    const { TOOLS_MENTOR } = await import("./tools-mentor.ts");
    // deno-lint-ignore no-explicit-any
    toolsHandlers = TOOLS_MENTOR as unknown as any[];
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

  // Despacho final: ferramenta rag:// -> tools-rag genérico ; senão -> handler do catálogo do cargo.
  const executarToolFinal = async (nome: string, toolArgs: Record<string, unknown>): Promise<string> => {
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
  const resultado = await chamarLlm({
    modelo: modeloOverride ?? MODELO_INTERNO,
    mensagens: [
      { role: "system", content: sistemaPrompt },
      ...histAlternado,
    ],
    tools: toolsCompletas,
    max_iter: 3,
    executarTool: executarToolFinal,
  });

  // ── 9. Persiste assistant ─────────────────────────────────────────────────
  const toolCallsParaGravar =
    resultado.tool_calls_executados.length > 0
      ? resultado.tool_calls_executados.map((tc) => ({
          toolName: tc.nome,
          args: tc.args,
        }))
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

  return {
    ok: true,
    mensagem: resultado.texto_final,
    tool_calls: resultado.tool_calls_executados,
  };
}
