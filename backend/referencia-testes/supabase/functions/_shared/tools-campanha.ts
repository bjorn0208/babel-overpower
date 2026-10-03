/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

/**
 * Tools de Campanha do Mentor (bloco 2 do plano-mãe, 2026-09-16).
 *
 * "Manda campanha pros leads que pediram orçamento e sumiram há 15 dias" vira,
 * pela barra: montar_publico → propor_campanha (cartão) → criar_campanha (só com
 * ok explícito) → status_campanha. O público SEMPRE nasce como lista de IDs
 * materializada (`filters.modo = 'lead_ids'`): o cron `processar-campanhas` só
 * entende tag e lista, e critério solto mandaria pra base inteira (bug de 08/09).
 *
 * Regras: campanha é ação irreversível — `criar_campanha` exige `confirmado=true`
 * e devolve erro se o dono não deu ok. O "esses" do turno seguinte vem da
 * seleção corrente da thread (`resultado_resumo` na bolha anterior, ver
 * canal-interno §9) — o handler lê de lá quando `lead_ids` não vier.
 */

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export type CtxCampanha = {
  tenant_id: string;
  user_id: string;
  supabase_admin: AnyClient;
  conversa_id?: string | null;
};

const fmt = (o: unknown) => JSON.stringify(o);
const MAX_IDS_NO_RESUMO = 500;

// ── Puro (testável sem rede) ───────────────────────────────────────────────

export type CriteriosPublico = {
  tags?: Array<{ chave: string; valor: string }>;
  temperatura?: string[];
  fase_pipeline?: string[];
  desfecho?: string[];
  origem?: string[];
  comprou?: boolean;
  dias_calado_min?: number;
  dias_calado_max?: number;
  so_na_base?: boolean;
  ids_restringir?: string[];
  limite?: number;
};

/** Normaliza os args do LLM pro jsonb da RPC `ler_leads_por_criterio`. */
export function criteriosDosArgs(args: Record<string, unknown>): CriteriosPublico {
  const c: CriteriosPublico = {};
  const lista = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : undefined;
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
  };
  if (Array.isArray(args.tags)) {
    c.tags = (args.tags as Array<Record<string, unknown>>)
      .map((t) => ({ chave: String(t?.chave ?? "").trim(), valor: String(t?.valor ?? "").trim() }))
      .filter((t) => t.chave && t.valor);
    if (c.tags.length === 0) delete c.tags;
  }
  const temp = lista(args.temperatura); if (temp) c.temperatura = temp;
  const fase = lista(args.fase_pipeline); if (fase) c.fase_pipeline = fase;
  const desf = lista(args.desfecho); if (desf) c.desfecho = desf;
  const orig = lista(args.origem); if (orig) c.origem = orig;
  if (typeof args.comprou === "boolean") c.comprou = args.comprou;
  const dmin = num(args.dias_calado_min); if (dmin !== undefined) c.dias_calado_min = dmin;
  const dmax = num(args.dias_calado_max); if (dmax !== undefined) c.dias_calado_max = dmax;
  if (typeof args.so_na_base === "boolean") c.so_na_base = args.so_na_base;
  const lim = num(args.limite); if (lim) c.limite = Math.min(lim, 2000);
  return c;
}

/** Descreve os critérios em pt-BR pra o cartão e pra bolha. */
export function descreverCriterios(c: CriteriosPublico, textoSemantico?: string): string {
  const p: string[] = [];
  if (c.tags?.length) p.push(c.tags.map((t) => `${t.chave} = ${t.valor.replace(/_/g, " ")}`).join(", "));
  if (c.temperatura?.length) p.push(`temperatura ${c.temperatura.join("/")}`);
  if (c.fase_pipeline?.length) p.push(`fase ${c.fase_pipeline.join("/")}`);
  if (c.desfecho?.length) p.push(`desfecho ${c.desfecho.join("/")}`);
  if (c.origem?.length) p.push(`origem ${c.origem.join("/")}`);
  if (c.comprou === true) p.push("já compraram");
  if (c.comprou === false) p.push("não compraram");
  if (c.dias_calado_min !== undefined) p.push(`calados há ${c.dias_calado_min}+ dias`);
  if (c.dias_calado_max !== undefined) p.push(`calados há no máximo ${c.dias_calado_max} dias`);
  if (textoSemantico) p.push(`parecidos com "${textoSemantico}"`);
  if (c.so_na_base === false) p.push("incluindo fora da Base");
  return p.length ? p.join(" · ") : "todos os leads da Base";
}

export type Proposta = {
  nome: string;
  tipo: "divulgacao" | "venda" | "pos_venda" | "agendamento";
  objetivo: string;
  oferta: string;
  publico_descricao: string;
  lead_ids: string[];
  window_start: string;
  window_end: string;
  weekdays: number[];
  throttle_per_hour: number | null;
  ends_at: string | null;
};

const TIPOS_OK = new Set(["divulgacao", "venda", "pos_venda", "agendamento"]);

export function montarProposta(args: Record<string, unknown>, leadIds: string[], publicoDescricao: string): Proposta {
  const tipo = TIPOS_OK.has(String(args.tipo)) ? (String(args.tipo) as Proposta["tipo"]) : "venda";
  const hora = (v: unknown, padrao: string) => (/^\d{2}:\d{2}$/.test(String(v ?? "")) ? String(v) : padrao);
  const dias = Array.isArray(args.weekdays) ? (args.weekdays as unknown[]).map(Number).filter((d) => d >= 0 && d <= 6) : [1, 2, 3, 4, 5];
  const teto = Number(args.throttle_per_hour);
  let ends: string | null = null;
  if (typeof args.termina_em === "string" && args.termina_em.trim()) {
    const d = new Date(args.termina_em);
    if (!Number.isNaN(d.getTime())) ends = d.toISOString();
  }
  return {
    nome: String(args.nome ?? "").trim() || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
    tipo,
    objetivo: String(args.objetivo ?? "").trim() || "Retomar contato e levar ao fechamento.",
    oferta: String(args.oferta ?? "").trim(),
    publico_descricao: publicoDescricao,
    lead_ids: leadIds,
    window_start: hora(args.window_start, "09:00"),
    window_end: hora(args.window_end, "18:00"),
    weekdays: dias.length ? dias : [1, 2, 3, 4, 5],
    throttle_per_hour: Number.isFinite(teto) && teto > 0 ? Math.min(Math.floor(teto), 200) : 20,
    ends_at: ends,
  };
}

const NOMES_DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** O cartão que o dono lê antes de dizer "ok". Texto puro — o front pode desenhar em cima. */
export function textoDoCartao(p: Proposta): string {
  const dias = p.weekdays.length === 5 && p.weekdays.join() === "1,2,3,4,5" ? "seg–sex" : p.weekdays.map((d) => NOMES_DIA[d]).join(", ");
  const fim = p.ends_at ? ` · termina ${new Date(p.ends_at).toLocaleDateString("pt-BR")}` : "";
  return [
    `📣 ${p.nome} (${p.tipo})`,
    `Público: ${p.lead_ids.length} lead(s) — ${p.publico_descricao}`,
    p.oferta ? `Oferta: ${p.oferta}` : null,
    `Objetivo do agente: ${p.objetivo}`,
    `Quando: ${dias} ${p.window_start}–${p.window_end} · até ${p.throttle_per_hour}/hora${fim}`,
    `Para de insistir se o lead recusar ou ficar 7 dias em silêncio.`,
    `Posso ligar? Responda "ok" pra eu criar, ou me diga o que ajustar.`,
  ].filter(Boolean).join("\n");
}

/** Resumo do resultado de uma tool pra caber na bolha (seleção corrente da thread). */
export function resumirResultadoTool(nome: string, resultado: string): Record<string, unknown> | null {
  try {
    const r = JSON.parse(resultado);
    const dados = r?.dados ?? {};
    const ids: string[] | undefined = Array.isArray(dados.lead_ids)
      ? dados.lead_ids
      : Array.isArray(dados.leads)
      ? dados.leads.map((l: Record<string, unknown>) => l?.id).filter(Boolean)
      : undefined;
    const out: Record<string, unknown> = { tool: nome };
    if (dados.tipo) out.tipo = dados.tipo;
    if (ids?.length) { out.lead_ids = ids.slice(0, MAX_IDS_NO_RESUMO); out.total = dados.total ?? ids.length; }
    if (dados.proposta) out.proposta = dados.proposta;
    if (dados.campanha_id) out.campanha_id = dados.campanha_id;
    if (typeof dados.descricao === "string") out.descricao = dados.descricao;
    return Object.keys(out).length > 1 ? out : null;
  } catch {
    return null;
  }
}

// ── Seleção corrente da thread ─────────────────────────────────────────────

async function ultimaSelecaoDaThread(ctx: CtxCampanha): Promise<{ lead_ids: string[]; descricao: string; proposta?: Proposta } | null> {
  if (!ctx.conversa_id) return null;
  const { data } = await ctx.supabase_admin
    .from("mentor_mensagens")
    .select("tool_calls")
    .eq("conversa_id", ctx.conversa_id)
    .eq("papel", "assistant")
    .not("tool_calls", "is", null)
    .order("criado_em", { ascending: false })
    .limit(6);
  for (const m of (data ?? []) as Array<{ tool_calls: unknown }>) {
    const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
    for (let i = calls.length - 1; i >= 0; i--) {
      const r = (calls[i] as Record<string, unknown>)?.resultado_resumo as Record<string, unknown> | undefined;
      if (r && Array.isArray(r.lead_ids) && r.lead_ids.length) {
        return { lead_ids: r.lead_ids as string[], descricao: String(r.descricao ?? ""), proposta: r.proposta as Proposta | undefined };
      }
    }
  }
  return null;
}

// ── Handlers ───────────────────────────────────────────────────────────────

export async function handlerMontarPublico(args: Record<string, unknown>, ctx: CtxCampanha): Promise<string> {
  const criterios = criteriosDosArgs(args);
  const textoSemantico = typeof args.texto_semantico === "string" ? args.texto_semantico.trim() : "";

  // Parte semântica (persona) — restringe a lista determinística ao que a busca por significado achou.
  if (textoSemantico) {
    try {
      const { gerarEmbeddingQuery } = await import("./tools-internas.ts");
      const emb = await gerarEmbeddingQuery(ctx.supabase_admin, textoSemantico);
      if (emb) {
        const { data } = await ctx.supabase_admin.rpc("buscar_leads_por_significado", {
          p_tenant_id: ctx.tenant_id, p_query_text: textoSemantico, p_query_embedding: emb, p_match_count: 300,
        });
        const ids = ((data ?? []) as Array<Record<string, unknown>>).map((l) => String(l.lead_id ?? l.id)).filter(Boolean);
        if (ids.length === 0) {
          return fmt({ ok: true, dados: { tipo: "publico_campanha", total: 0, lead_ids: [], descricao: descreverCriterios(criterios, textoSemantico) },
            mensagem: `Nenhum lead parecido com "${textoSemantico}". Quer tentar outra descrição ou tirar esse filtro?` });
        }
        criterios.ids_restringir = ids;
      }
    } catch (e) {
      console.warn("[tools-campanha] busca semântica falhou, seguindo só com critérios:", (e as Error).message);
    }
  }

  const { data, error } = await ctx.supabase_admin.rpc("ler_leads_por_criterio", { p_tenant_id: ctx.tenant_id, p_criterios: criterios });
  if (error) return fmt({ ok: false, mensagem: `Não consegui montar o público: ${error.message}` });
  const leads = (data ?? []) as Array<Record<string, unknown>>;
  const descricao = descreverCriterios(criterios, textoSemantico || undefined);
  const amostra = leads.slice(0, 5).map((l) => ({
    id: l.id, nome: l.nome ?? `contato final ${String(l.phone ?? "").slice(-4)}`,
    dias_calado: l.dias_calado, temperatura: l.temperatura_lead, fase: l.fase_pipeline, comprou: l.comprou,
  }));
  const nomes = amostra.map((a) => a.nome).join(", ");
  return fmt({
    ok: true,
    dados: { tipo: "publico_campanha", total: leads.length, lead_ids: leads.map((l) => l.id), descricao, amostra, criterios },
    mensagem: leads.length === 0
      ? `Nenhum lead da Base bate com: ${descricao}. Quer afrouxar algum critério?`
      : `${leads.length} lead(s): ${descricao}. Exemplos: ${nomes}. Quer tirar alguém ou já monto a campanha?`,
  });
}

export async function handlerProporCampanha(args: Record<string, unknown>, ctx: CtxCampanha): Promise<string> {
  let leadIds = Array.isArray(args.lead_ids) ? (args.lead_ids as unknown[]).map(String) : [];
  let descricao = typeof args.publico_descricao === "string" ? args.publico_descricao : "";
  if (leadIds.length === 0) {
    const sel = await ultimaSelecaoDaThread(ctx);
    if (!sel) return fmt({ ok: false, mensagem: "Antes de propor, monte o público com montar_publico (não achei nenhuma lista nesta conversa)." });
    leadIds = sel.lead_ids; descricao = descricao || sel.descricao;
  }
  const proposta = montarProposta(args, leadIds, descricao || "público desta conversa");
  return fmt({
    ok: true,
    dados: { tipo: "campanha_proposta", proposta, lead_ids: leadIds, total: leadIds.length, descricao: proposta.publico_descricao },
    mensagem: textoDoCartao(proposta),
  });
}

export async function handlerCriarCampanha(args: Record<string, unknown>, ctx: CtxCampanha): Promise<string> {
  if (args.confirmado !== true) {
    return fmt({ ok: false, erro: "sem_confirmacao", mensagem: "Campanha é irreversível: mostre o cartão (propor_campanha) e só chame criar_campanha depois que o dono responder ok." });
  }
  let proposta = (args.proposta && typeof args.proposta === "object") ? (args.proposta as Proposta) : null;
  if (!proposta) {
    const sel = await ultimaSelecaoDaThread(ctx);
    if (!sel?.proposta) return fmt({ ok: false, mensagem: "Não achei a proposta nesta conversa. Chame propor_campanha primeiro." });
    proposta = sel.proposta;
  }
  if (!proposta.lead_ids?.length) return fmt({ ok: false, mensagem: "A proposta está sem leads." });
  if (!TIPOS_OK.has(proposta.tipo)) proposta.tipo = "venda";

  const sb = ctx.supabase_admin;
  const descricaoAgente = [proposta.oferta ? `Oferta: ${proposta.oferta}` : null, `Público: ${proposta.publico_descricao}`, "Criada pelo Mentor (commandbar)."]
    .filter(Boolean).join(" ");
  const { data: criada, error } = await sb.from("campanhas").insert({
    tenant_id: ctx.tenant_id,
    name: proposta.nome,
    description: descricaoAgente,
    type: proposta.tipo,
    objective: proposta.objetivo,
    status: "ativa",
    filters: { modo: "lead_ids", lead_ids: proposta.lead_ids, origem: "commandbar", publico_descricao: proposta.publico_descricao, operador_global: "AND", criterios: [] },
    duration_mode: proposta.ends_at ? "prazo" : "vitalicia",
    starts_at: new Date().toISOString(),
    ends_at: proposta.ends_at,
    window_start: proposta.window_start,
    window_end: proposta.window_end,
    weekdays: proposta.weekdays,
    skip_holidays: true,
    throttle_per_hour: proposta.throttle_per_hour,
    desistance_silence_days: 7,
  }).select("id, name").single();
  if (error || !criada) return fmt({ ok: false, mensagem: `Não consegui criar a campanha: ${error?.message ?? "sem retorno"}` });

  return fmt({
    ok: true,
    dados: { tipo: "campanha_criada", campanha_id: criada.id, total: proposta.lead_ids.length, lead_ids: proposta.lead_ids, descricao: proposta.publico_descricao },
    mensagem: `Campanha "${criada.name}" criada e ativa com ${proposta.lead_ids.length} lead(s). O agente começa a chamar na próxima janela (${proposta.window_start}–${proposta.window_end}, até ${proposta.throttle_per_hour}/hora). Pergunte "como tá a campanha" quando quiser.`,
  });
}

export async function handlerStatusCampanha(args: Record<string, unknown>, ctx: CtxCampanha): Promise<string> {
  const sb = ctx.supabase_admin;
  let q = sb.from("campanhas").select("id, name, type, status, created_at, starts_at, ends_at")
    .eq("tenant_id", ctx.tenant_id).is("deleted_at", null).order("created_at", { ascending: false }).limit(5);
  if (typeof args.campanha_id === "string" && args.campanha_id) q = q.eq("id", args.campanha_id);
  else if (typeof args.nome === "string" && args.nome.trim()) q = q.ilike("name", `%${args.nome.trim()}%`);
  const { data: camps, error } = await q;
  if (error) return fmt({ ok: false, mensagem: `Não consegui ler as campanhas: ${error.message}` });
  if (!camps?.length) return fmt({ ok: true, dados: { tipo: "status_campanha", campanhas: [] }, mensagem: "Nenhuma campanha encontrada." });

  const ids = (camps as Array<{ id: string }>).map((c) => c.id);
  const { data: lc } = await sb.from("leads_campanha").select("campaign_id, state, phase, exit_reason, last_contact_at").in("campaign_id", ids);
  const porCamp = new Map<string, { total: number; ativos: number; aguardando: number; contatados: number; fechados: number; desistentes: number; motivos: Record<string, number> }>();
  for (const r of (lc ?? []) as Array<Record<string, unknown>>) {
    const k = String(r.campaign_id);
    const s = porCamp.get(k) ?? { total: 0, ativos: 0, aguardando: 0, contatados: 0, fechados: 0, desistentes: 0, motivos: {} };
    s.total++;
    if (r.state === "ativo") { s.ativos++; if (r.phase === "aguardando") s.aguardando++; if (r.last_contact_at) s.contatados++; }
    if (r.state === "fechado") s.fechados++;
    if (r.state === "desistente") { s.desistentes++; const m = String(r.exit_reason ?? "sem_motivo"); s.motivos[m] = (s.motivos[m] ?? 0) + 1; }
    porCamp.set(k, s);
  }
  const linhas = (camps as Array<Record<string, unknown>>).map((c) => {
    const s = porCamp.get(String(c.id)) ?? { total: 0, ativos: 0, aguardando: 0, contatados: 0, fechados: 0, desistentes: 0, motivos: {} };
    return { id: c.id, nome: c.name, tipo: c.type, status: c.status, ...s };
  });
  const texto = linhas.map((l) =>
    `${l.nome} (${l.status}): ${l.total} na esteira · ${l.contatados} chamados · ${l.aguardando} aguardando · ${l.fechados} fechados · ${l.desistentes} desistiram` +
    (Object.keys(l.motivos).length ? ` (${Object.entries(l.motivos).map(([k, v]) => `${v} ${k}`).join(", ")})` : "")
  ).join("\n");
  return fmt({ ok: true, dados: { tipo: "status_campanha", campanhas: linhas }, mensagem: texto });
}

// ── Registro ───────────────────────────────────────────────────────────────

export const NOMES_TOOLS_CAMPANHA = ["montar_publico", "propor_campanha", "criar_campanha", "status_campanha"] as const;

export const TOOLS_CAMPANHA = [
  {
    type: "function",
    function: {
      name: "montar_publico",
      description:
        "Monta o PÚBLICO de uma campanha a partir do que o dono descreveu e devolve a lista real de leads (ids, total, exemplos). Use SEMPRE que o dono disser 'manda campanha pra...', 'quantos leads que...', 'os que sumiram/pararam de responder', 'quem pediu orçamento e não fechou', 'leads frios/quentes de X'. Traduza a frase em critérios: tags chave:valor (dados capturados da ficha), temperatura (frio/morno/quente), fase_pipeline (novo/qualificando/apresentando/negociando/fechado/desistiu), desfecho (sumido/convertido), origem, comprou (true/false), dias_calado_min/max (dias sem o lead responder), texto_semantico (descrição livre pra busca por significado, ex.: 'reclamou do preço'). Só leads da Base entram (so_na_base=true por padrão). NUNCA invente o número: use o total que esta tool devolve.",
      parameters: {
        type: "object",
        properties: {
          tags: { type: "array", items: { type: "object", properties: { chave: { type: "string" }, valor: { type: "string" } }, required: ["chave", "valor"] }, description: "Dados capturados, ex.: [{chave:'produto_identificado', valor:'piso'}]" },
          temperatura: { type: "array", items: { type: "string", enum: ["frio", "morno", "quente"] } },
          fase_pipeline: { type: "array", items: { type: "string" } },
          desfecho: { type: "array", items: { type: "string" }, description: "ex.: ['sumido']" },
          origem: { type: "array", items: { type: "string" } },
          comprou: { type: "boolean" },
          dias_calado_min: { type: "number", description: "Lead sem responder há pelo menos N dias" },
          dias_calado_max: { type: "number" },
          texto_semantico: { type: "string", description: "Descrição livre do perfil (busca por significado nas memórias do lead)" },
          so_na_base: { type: "boolean", description: "Padrão true. false só se o dono pedir explicitamente leads fora da Base." },
          limite: { type: "number", description: "Máximo de leads (padrão 500)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propor_campanha",
      description:
        "Monta o CARTÃO da campanha pra o dono aprovar (NÃO cria nada). Chame depois de montar_publico, quando o dono disser o que oferecer/como abordar. Se lead_ids não vier, usa a última lista desta conversa. Devolva o texto do cartão ao dono e PARE: espere o 'ok' dele antes de criar_campanha.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string" },
          tipo: { type: "string", enum: ["divulgacao", "venda", "pos_venda", "agendamento"] },
          objetivo: { type: "string", description: "O que o agente deve conseguir na conversa (ex.: 'fechar o orçamento de piso')" },
          oferta: { type: "string", description: "A proposta/condição que o agente vai apresentar (ex.: '10% até sexta')" },
          publico_descricao: { type: "string" },
          lead_ids: { type: "array", items: { type: "string" } },
          window_start: { type: "string", description: "HH:MM, padrão 09:00" },
          window_end: { type: "string", description: "HH:MM, padrão 18:00" },
          weekdays: { type: "array", items: { type: "number" }, description: "0=dom … 6=sáb; padrão seg–sex" },
          throttle_per_hour: { type: "number", description: "Máximo por hora, padrão 20" },
          termina_em: { type: "string", description: "Data/hora ISO ou dd/mm/aaaa em que a campanha encerra (opcional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_campanha",
      description:
        "CRIA a campanha e liga o agente pra chamar os leads um a um. Só chame com confirmado=true DEPOIS que o dono respondeu 'ok'/'pode'/'vai' ao cartão de propor_campanha. Nunca chame antes do ok. A proposta é a da conversa (não precisa repassar).",
      parameters: {
        type: "object",
        properties: {
          confirmado: { type: "boolean", description: "true só quando o dono aprovou explicitamente o cartão" },
          proposta: { type: "object", description: "Opcional: a proposta devolvida por propor_campanha" },
        },
        required: ["confirmado"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "status_campanha",
      description:
        "Como está uma campanha: quantos na esteira, chamados, aguardando, fechados, desistentes e por quê. Use quando o dono perguntar 'como tá a campanha', 'quantos responderam', 'deu resultado?'. Sem nome = as 5 mais recentes.",
      parameters: {
        type: "object",
        properties: { nome: { type: "string" }, campanha_id: { type: "string" } },
      },
    },
  },
];

export async function executarToolCampanha(nome: string, args: Record<string, unknown>, ctx: CtxCampanha): Promise<string> {
  switch (nome) {
    case "montar_publico": return handlerMontarPublico(args, ctx);
    case "propor_campanha": return handlerProporCampanha(args, ctx);
    case "criar_campanha": return handlerCriarCampanha(args, ctx);
    case "status_campanha": return handlerStatusCampanha(args, ctx);
    default: return fmt({ ok: false, mensagem: `Tool de campanha desconhecida: ${nome}` });
  }
}
