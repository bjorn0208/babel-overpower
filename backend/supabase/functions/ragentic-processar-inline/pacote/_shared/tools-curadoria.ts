/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

/**
 * Tools do cargo Curadoria (canal interno admin).
 *
 * Quando o cargo ativo no canal interno é "Curadoria" (`cargos.nome='Curadoria'
 * AND tipologia='admin' AND escopo='global'`), o `ragentic-processar-inline`
 * carrega TOOLS_CURADORIA em vez de TOOLS_MENTOR. Tools cobrem o ciclo de
 * curadoria do motor RAG-First:
 *
 *   - criar_aviso              → INSERT em `public.avisos_curadoria`
 *   - marcar_aviso_lido        → UPDATE em `public.avisos_curadoria`
 *   - listar_avisos_pendentes  → SELECT
 *   - propor_bloco             → INSERT em `public.candidatos_bloco`
 *   - consultar_status_motor   → snapshot (RPCs counts + fila destilação)
 *
 * Padrão simétrico a `tools-mentor.ts`:
 *   - `ToolSchema` (OpenAI/OpenRouter function calling)
 *   - `TOOLS_CURADORIA: ToolSchema[]`
 *   - `executarTool(nome, args, ctx)` dispatcha pro handler
 *   - cada handler retorna `string` (mensagem pro LLM injetar no contexto)
 *
 * Cuidados:
 *   - Apenas `platform_admin` pode invocar (RLS de `avisos_curadoria` filtra).
 *   - `ctx.supabase_admin` é cliente service_role — não confiar args sem validar.
 *   - Severidade `critico` deve ser raro — descrever bem na mensagem.
 *
 * Onda 1 entregou tabela + bucket. Onda 2C.7 entrega estas tools standalone.
 * Onda 2C.8 plugará no `ragentic-processar-inline/index.ts` com smoke test
 * antes/depois pra confirmar canal Mentor existente segue funcionando.
 */

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export interface CtxCuradoria {
  user_id: string;
  supabase_admin: AnyClient;
  /** Slug da aba ativa quando a tool foi invocada (ex: 'chamadas', 'blocos').
   *  Preenchido pelo frontend via `contexto_curadoria.aba_ativa`. */
  contexto_aba?: string | null;
  /** Tenant impersonado no momento (null = universo/global). */
  tenant_impersonado_id?: string | null;
  nicho_impersonado_id?: string | null;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ResultadoTool {
  ok: boolean;
  mensagem: string;
}

// ============================================================
// SCHEMAS (function calling)
// ============================================================

export const TOOLS_CURADORIA: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "criar_aviso",
      description:
        "Cria um aviso autônomo no app Curadoria. Use quando detectar padrão, bug, oportunidade ou recomendação que o Theus precisa ver. Aparece como card na aba Avisos.",
      parameters: {
        type: "object",
        properties: {
          titulo: {
            type: "string",
            description: "Resumo curto (até ~80 chars). Direto ao ponto.",
          },
          mensagem: {
            type: "string",
            description:
              "Corpo do aviso (markdown leve aceito). Explique o problema + o que precisa ser feito.",
          },
          severidade: {
            type: "string",
            enum: ["info", "sugestao", "atencao", "critico"],
            description:
              "info=neutro, sugestao=melhoria, atencao=requer ação em breve, critico=urgente. Padrão: info.",
          },
          contexto_aba: {
            type: "string",
            description:
              "Slug da aba relacionada (ex: 'chamadas', 'blocos', 'crons', 'cross_nicho'). Permite click no aviso levar pra aba certa.",
          },
          escopo: {
            type: "string",
            enum: ["global", "nicho", "tenant"],
            description:
              "Quem deve ver este aviso. Padrão: global (Theus admin).",
          },
          acao_sugerida_tipo: {
            type: "string",
            description:
              "Tipo da ação sugerida (ex: 'religar_gaveta', 'editar_prompt', 'aprovar_candidato'). Renderiza botão de ação no card.",
          },
          acao_sugerida_payload: {
            type: "object",
            description:
              "Payload da ação (depende do tipo). Ex: { gaveta: 'regras_operacionais_blocos', escopo: 'global' }.",
          },
        },
        required: ["titulo", "mensagem"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "marcar_aviso_lido",
      description:
        "Marca um aviso como lido (sai da bandeja de pendentes). Use quando Theus confirmar que viu/resolveu.",
      parameters: {
        type: "object",
        properties: {
          aviso_id: { type: "string", description: "UUID do aviso." },
        },
        required: ["aviso_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_avisos_pendentes",
      description:
        "Lista os avisos não lidos da Curadoria, filtrável por severidade. Use quando Theus pedir resumo do que tá pendente.",
      parameters: {
        type: "object",
        properties: {
          severidade: {
            type: "string",
            enum: ["info", "sugestao", "atencao", "critico"],
            description: "Filtrar por severidade (opcional).",
          },
          limite: {
            type: "number",
            description: "Quantidade máxima de avisos (padrão: 10, máx: 50).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propor_bloco",
      description:
        "Propõe novo bloco de conhecimento/comportamento/gatilho ao Theus. Cria entrada em `candidatos_bloco` pra revisão humana. Use quando observar padrão em conversas reais que vale virar bloco.",
      parameters: {
        type: "object",
        properties: {
          gaveta: {
            type: "string",
            enum: [
              "blocos_conhecimento",
              "blocos_comportamento",
              "blocos_humanizacao",
              "blocos_variacao",
              "blocos_gatilho",
              "blocos_procedurais",
              "regras_operacionais_blocos",
              "anti_padroes",
              "emocao_blocos",
              "prova_social_blocos",
            ],
            description: "Qual gaveta o bloco proposto pertence.",
          },
          conteudo_proposto: {
            type: "string",
            description: "Texto do bloco. Direto, sem floreio.",
          },
          escopo_alvo: {
            type: "string",
            enum: ["global", "nicho", "tenant"],
            description: "Onde o bloco deve viver quando aprovado.",
          },
          justificativa: {
            type: "string",
            description:
              "Por quê este bloco resolve um problema observado. Cita exemplos curtos.",
          },
        },
        required: ["gaveta", "conteudo_proposto", "escopo_alvo", "justificativa"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_status_motor",
      description:
        "Retorna snapshot do motor Ragentic: versões edge, contagem por gaveta de bloco, fila pendente do sono (memoria_lead destilada vs pendente), advisors críticos. Use quando Theus pedir 'como tá o motor'.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ============================================================
// EXECUTAR TOOL (dispatcher)
// ============================================================

export async function executarTool(
  nome: string,
  args: Record<string, unknown>,
  ctx: CtxCuradoria,
): Promise<string> {
  switch (nome) {
    case "criar_aviso":
      return handlerCriarAviso(args, ctx);
    case "marcar_aviso_lido":
      return handlerMarcarAvisoLido(args, ctx);
    case "listar_avisos_pendentes":
      return handlerListarAvisosPendentes(args, ctx);
    case "propor_bloco":
      return handlerProporBloco(args, ctx);
    case "consultar_status_motor":
      return handlerConsultarStatusMotor(ctx);
    default:
      return `Tool desconhecida: "${nome}".`;
  }
}

// ============================================================
// HANDLERS
// ============================================================

async function handlerCriarAviso(
  args: Record<string, unknown>,
  ctx: CtxCuradoria,
): Promise<string> {
  const titulo = String(args.titulo ?? "").trim();
  const mensagem = String(args.mensagem ?? "").trim();
  if (!titulo || !mensagem) {
    return "Erro: titulo e mensagem são obrigatórios.";
  }
  const severidadesValidas = ["info", "sugestao", "atencao", "critico"];
  const severidade = severidadesValidas.includes(String(args.severidade))
    ? String(args.severidade)
    : "info";
  const escoposValidos = ["global", "nicho", "tenant"];
  const escopo = escoposValidos.includes(String(args.escopo))
    ? String(args.escopo)
    : "global";

  // Resolver cargo Curadoria pra autoria
  const { data: cargo } = await ctx.supabase_admin
    .from("cargos")
    .select("id")
    .eq("nome", "Curadoria")
    .eq("tipologia", "admin")
    .eq("escopo", "global")
    .limit(1)
    .maybeSingle();

  if (!cargo?.id) {
    return "Erro: cargo Curadoria não encontrado no banco.";
  }

  const linha: Record<string, unknown> = {
    autor_tipo: "cargo",
    cargo_id: cargo.id,
    severidade,
    titulo,
    mensagem,
    contexto_aba: args.contexto_aba ?? ctx.contexto_aba ?? null,
    acao_sugerida_tipo: args.acao_sugerida_tipo ?? null,
    acao_sugerida_payload: args.acao_sugerida_payload ?? null,
    escopo,
  };
  if (escopo === "tenant") {
    linha.tenant_id = ctx.tenant_impersonado_id ?? ctx.user_id;
  } else if (escopo === "nicho") {
    linha.nicho_id = ctx.nicho_impersonado_id ?? null;
  }

  const { data: novo, error } = await ctx.supabase_admin
    .from("avisos_curadoria")
    .insert(linha)
    .select("id")
    .single();

  if (error) {
    return `Erro ao criar aviso: ${error.message ?? String(error)}`;
  }
  return `Aviso criado (id: ${novo.id}). Severidade: ${severidade}. Aparecerá na aba Avisos da Curadoria.`;
}

async function handlerMarcarAvisoLido(
  args: Record<string, unknown>,
  ctx: CtxCuradoria,
): Promise<string> {
  const aviso_id = String(args.aviso_id ?? "").trim();
  if (!aviso_id) return "Erro: aviso_id é obrigatório.";

  const { error } = await ctx.supabase_admin
    .from("avisos_curadoria")
    .update({
      lido_em: new Date().toISOString(),
      lido_por: ctx.user_id,
    })
    .eq("id", aviso_id);

  if (error) {
    return `Erro ao marcar lido: ${error.message ?? String(error)}`;
  }
  return `Aviso ${aviso_id} marcado como lido.`;
}

async function handlerListarAvisosPendentes(
  args: Record<string, unknown>,
  ctx: CtxCuradoria,
): Promise<string> {
  const limite = Math.min(50, Math.max(1, Number(args.limite ?? 10)));
  const severidade = String(args.severidade ?? "");

  let q = ctx.supabase_admin
    .from("avisos_curadoria")
    .select("id, severidade, titulo, contexto_aba, criado_em")
    .is("lido_em", null)
    .is("arquivado_em", null)
    .is("deleted_at", null)
    .order("criado_em", { ascending: false })
    .limit(limite);

  if (["info", "sugestao", "atencao", "critico"].includes(severidade)) {
    q = q.eq("severidade", severidade);
  }
  const { data, error } = await q;
  if (error) return `Erro ao listar avisos: ${error.message ?? String(error)}`;
  if (!data?.length) {
    return severidade
      ? `Nenhum aviso pendente com severidade ${severidade}.`
      : "Nenhum aviso pendente.";
  }
  const linhas = data
    .map(
      (a: Record<string, unknown>) =>
        `- [${a.severidade}] ${a.titulo} (id ${String(a.id).slice(0, 8)}, aba ${a.contexto_aba ?? "-"})`,
    )
    .join("\n");
  return `${data.length} aviso(s) pendente(s):\n${linhas}`;
}

async function handlerProporBloco(
  args: Record<string, unknown>,
  ctx: CtxCuradoria,
): Promise<string> {
  const gaveta = String(args.gaveta ?? "").trim();
  const conteudo = String(args.conteudo_proposto ?? "").trim();
  const justificativa = String(args.justificativa ?? "").trim();
  // escopo_alvo é lido só pra notas (não vai pra coluna — schema atual de
  // candidatos_bloco não tem campo de escopo alvo; isso será evoluído na
  // onda C3 do trilho B/cross-nicho).
  const escopo_alvo = String(args.escopo_alvo ?? "global");

  if (!gaveta || !conteudo || !justificativa) {
    return "Erro: gaveta, conteudo_proposto e justificativa são obrigatórios.";
  }

  // tenant_id é obrigatório no schema; quando admin opera sem impersonação
  // (universo), gravamos com o user_id do próprio admin como tenant_id —
  // futura migration `candidatos_bloco_aceita_global` permitirá tenant_id
  // null quando vier do cargo Curadoria. Por hora: trade-off seguro.
  const tenantId = ctx.tenant_impersonado_id ?? ctx.user_id;

  const linha: Record<string, unknown> = {
    tenant_id: tenantId,
    excerto: conteudo,
    contexto: `[Proposta do cargo Curadoria · escopo_alvo=${escopo_alvo}]\n${justificativa}`,
    tipo_sugerido: gaveta,
    categoria_sugerida: null,
    num_leads_independentes: 0,
    evidencia_lead_ids: [],
    status: "pendente",
  };
  const { data: novo, error } = await ctx.supabase_admin
    .from("candidatos_bloco")
    .insert(linha)
    .select("id")
    .single();

  if (error) {
    return `Erro ao propor bloco: ${error.message ?? String(error)}`;
  }
  return `Bloco proposto (id: ${novo.id}). Aparecerá na bandeja de candidatos pra Theus aprovar/recusar.`;
}

async function handlerConsultarStatusMotor(ctx: CtxCuradoria): Promise<string> {
  const partes: string[] = [];

  // Contagem por gaveta — só blocos ativos e vetorizados
  const gavetas: Array<{ tab: string; label: string }> = [
    { tab: "blocos_conhecimento", label: "conhecimento" },
    { tab: "blocos_comportamento", label: "comportamento" },
    { tab: "diretriz_bolha_blocos", label: "diretriz_bolha" },
    { tab: "blocos_meta", label: "meta" },
    { tab: "blocos_gatilho", label: "gatilho" },
    { tab: "regras_operacionais_blocos", label: "regras_operacionais" },
    { tab: "blocos_humanizacao", label: "humanizacao" },
  ];
  const linhasGaveta: string[] = [];
  for (const g of gavetas) {
    const { count } = await ctx.supabase_admin
      .from(g.tab)
      .select("id", { count: "exact", head: true });
    linhasGaveta.push(`  ${g.label.padEnd(20)} ${count ?? 0}`);
  }
  partes.push("Blocos por gaveta (total):\n" + linhasGaveta.join("\n"));

  // Fila de destilação (memoria_lead com destilado_em IS NULL)
  const { count: pendentes } = await ctx.supabase_admin
    .from("memoria_lead")
    .select("id", { count: "exact", head: true })
    .is("destilado_em", null);
  const { count: destilados } = await ctx.supabase_admin
    .from("memoria_lead")
    .select("id", { count: "exact", head: true })
    .not("destilado_em", "is", null);
  partes.push(
    `\nFila do sono: ${pendentes ?? 0} pendente(s) · ${destilados ?? 0} destilado(s).`,
  );

  // Avisos pendentes
  const { count: avisos } = await ctx.supabase_admin
    .from("avisos_curadoria")
    .select("id", { count: "exact", head: true })
    .is("lido_em", null)
    .is("arquivado_em", null)
    .is("deleted_at", null);
  partes.push(`Avisos pendentes na Curadoria: ${avisos ?? 0}.`);

  return partes.join("\n");
}
