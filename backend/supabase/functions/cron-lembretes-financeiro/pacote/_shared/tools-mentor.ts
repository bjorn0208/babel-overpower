/**
 * _shared/tools-mentor.ts
 *
 * Handlers das tools do Cargo Mentor — extraídos fielmente de
 * `supabase/functions/agente-mestre-chat/handlers.ts` (extração Fiel, Fusão C1 / Fase 3b).
 *
 * Comportamento idêntico ao original: mesmas tabelas, colunas, operações de banco,
 * textos de retorno, fluxo de cada handler. Zero mudança de regra de negócio.
 *
 * Infra reutilizada de `_shared/`:
 *   - CORS: `_shared/cors.ts`
 *   - Cliente Supabase: `_shared/supabase.ts`
 *   - LLM/OpenRouter: cada motor injeta via `inferirPlaceholdersComLLM` (recebe
 *     SupabaseClient como parâmetro — sem acoplamento à infra local).
 *
 * Nota sobre `ToolSchema`: tipo definido localmente aqui (não existe em _shared/);
 * equivalente ao tipo exportado por `agente-mestre-chat/compartilhado/openrouter.ts`.
 *
 * Pendências anotadas (extração fiel — não corrigir nesta fase):
 *   - `handlerMostrarKpi`: série temporal usa `Math.random()` → valores não
 *     determinísticos (comportamento original preservado).
 *   - `handlerCadastrarBlocoConhecimento`: coluna `title`/`content` em inglês
 *     (débito §7.3 da tabela `blocos_conhecimento` — não renomear nesta fase).
 *   - `resolverAgenteId`: busca em tabela `agentes` (não `agentes_usuario`) — fiel ao original.
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type CtxMentor = {
  user_id: string;
  supabase_admin: SupabaseClient;
};

export type ResultadoTool = {
  sucesso: boolean;
  mensagem: string;
  payload?: Record<string, unknown>;
};

/** Schema de tool no formato OpenAI tool-calling. */
export type ToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

// ---------------------------------------------------------------------------
// Utilitários internos
// ---------------------------------------------------------------------------

/** Resolve o agente_id do tenant a partir do user_id. */
async function resolverAgenteId(
  supabase: SupabaseClient,
  user_id: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("agentes")
    .select("id")
    .eq("user_id", user_id)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Formata ResultadoTool como string pra o LLM. */
function fmt(r: ResultadoTool): string {
  return r.sucesso
    ? `✓ ${r.mensagem}${r.payload?.id ? ` (id: ${r.payload.id})` : ""}`
    : `✗ Erro: ${r.mensagem}`;
}

// ---------------------------------------------------------------------------
// abrir_app — retorna intent UI; frontend interpreta o campo `abrir_app_id`
// ---------------------------------------------------------------------------
export async function handlerAbrirApp(
  args: Record<string, unknown>,
  _ctx: CtxMentor,
): Promise<string> {
  const app_id = String(args.app_id ?? "");
  if (!app_id) return fmt({ sucesso: false, mensagem: "app_id não informado." });
  return fmt({
    sucesso: true,
    mensagem: `Abrindo o app "${app_id}"...`,
    payload: { abrir_app_id: app_id },
  });
}

// ---------------------------------------------------------------------------
// cadastrar_produto
// ---------------------------------------------------------------------------
export async function handlerCadastrarProduto(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const nome = String(args.nome ?? "").trim();
  if (!nome) return fmt({ sucesso: false, mensagem: "nome do produto é obrigatório." });

  const insert: Record<string, unknown> = {
    nome,
    owner_id: ctx.user_id,
  };
  if (args.descricao) insert.descricao_curta = String(args.descricao);
  if (args.categoria_id) insert.tipo_produto_id = String(args.categoria_id);

  const { data, error } = await ctx.supabase_admin
    .from("produtos")
    .insert(insert)
    .select("id")
    .single();
  if (error) return fmt({ sucesso: false, mensagem: error.message });
  return fmt({ sucesso: true, mensagem: `Produto "${nome}" cadastrado.`, payload: { id: data?.id } });
}

// ---------------------------------------------------------------------------
// criar_cliente
// ---------------------------------------------------------------------------
export async function handlerCriarCliente(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const nome = String(args.nome ?? "").trim();
  const telefone = String(args.telefone ?? "").trim();
  if (!nome || !telefone) {
    return fmt({ sucesso: false, mensagem: "nome e telefone são obrigatórios." });
  }

  const insert: Record<string, unknown> = { nome, telefone, owner_id: ctx.user_id };
  if (args.email) insert.email = String(args.email);

  const { data, error } = await ctx.supabase_admin
    .from("clientes")
    .insert(insert)
    .select("id")
    .single();
  if (error) return fmt({ sucesso: false, mensagem: error.message });
  return fmt({ sucesso: true, mensagem: `Cliente "${nome}" criado.`, payload: { id: data?.id } });
}

// ---------------------------------------------------------------------------
// atualizar_empresa
// ---------------------------------------------------------------------------
export async function handlerAtualizarEmpresa(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const campos: Record<string, unknown> = {};
  if (args.nome_fantasia) campos.nome = String(args.nome_fantasia);
  if (args.cnpj) campos.cnpj = String(args.cnpj);
  if (args.endereco) campos.endereco = String(args.endereco);
  if (args.telefone) campos.whatsapp = String(args.telefone);

  if (Object.keys(campos).length === 0) {
    return fmt({ sucesso: false, mensagem: "Nenhum campo informado pra atualizar." });
  }
  campos.updated_at = new Date().toISOString();

  const { error } = await ctx.supabase_admin
    .from("empresas")
    .update(campos)
    .eq("user_id", ctx.user_id);
  if (error) return fmt({ sucesso: false, mensagem: error.message });
  return fmt({ sucesso: true, mensagem: "Empresa atualizada." });
}

// ---------------------------------------------------------------------------
// criar_categoria
// ---------------------------------------------------------------------------
export async function handlerCriarCategoria(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const nome = String(args.nome ?? "").trim();
  if (!nome) return fmt({ sucesso: false, mensagem: "nome da categoria é obrigatório." });

  const insert: Record<string, unknown> = { nome, owner_id: ctx.user_id };
  if (args.descricao) insert.descricao = String(args.descricao);

  const { data, error } = await ctx.supabase_admin
    .from("categorias_produto")
    .insert(insert)
    .select("id")
    .single();
  if (error) return fmt({ sucesso: false, mensagem: error.message });
  return fmt({ sucesso: true, mensagem: `Categoria "${nome}" criada.`, payload: { id: data?.id } });
}

// ---------------------------------------------------------------------------
// cadastrar_bloco_conhecimento
// ---------------------------------------------------------------------------
export async function handlerCadastrarBlocoConhecimento(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const titulo = String(args.titulo ?? "").trim();
  const conteudo = String(args.conteudo ?? "").trim();
  const escopo = String(args.escopo ?? "tenant");

  if (!titulo || !conteudo) {
    return fmt({ sucesso: false, mensagem: "titulo e conteudo são obrigatórios." });
  }

  const agente_id = await resolverAgenteId(ctx.supabase_admin, ctx.user_id);
  if (!agente_id) {
    return fmt({ sucesso: false, mensagem: "Agente do tenant não encontrado." });
  }

  const { data, error } = await ctx.supabase_admin
    .from("blocos_conhecimento")
    .insert({
      title: titulo,
      content: conteudo,
      escopo,
      agente_id,
      tipo: "conhecimento",
      ativo: true,
      embedding_status: "pendente",
    })
    .select("id")
    .single();
  if (error) return fmt({ sucesso: false, mensagem: error.message });
  return fmt({
    sucesso: true,
    mensagem: `Bloco de conhecimento "${titulo}" cadastrado (escopo: ${escopo}).`,
    payload: { id: data?.id },
  });
}

// ---------------------------------------------------------------------------
// mostrar_kpi — agrega KPI de uma métrica do tenant e retorna série temporal
// ---------------------------------------------------------------------------
export async function handlerMostrarKpi(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const metrica = String(args.metrica ?? "leads_quentes");
  const periodo = String(args.periodo ?? "30d");
  const diasMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const dias = diasMap[periodo] ?? 30;
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  const sb = ctx.supabase_admin;
  let valor = 0;
  let serieTemporal: Array<{ data: string; valor: number }> = [];
  let variacaoPct: number | null = null;

  if (metrica === "leads_quentes") {
    const { count } = await sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.user_id)
      .eq("temperatura_lead", "quente")
      .gte("updated_at", desde);
    valor = count ?? 0;
  } else if (metrica === "conversoes_mes") {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const { count } = await sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.user_id)
      .not("fase_cliente", "is", null)
      .gte("updated_at", inicioMes.toISOString());
    valor = count ?? 0;
  } else if (metrica === "taxa_conversao") {
    const { count: total } = await sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.user_id)
      .gte("created_at", desde);
    const { count: conv } = await sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.user_id)
      .not("fase_cliente", "is", null)
      .gte("created_at", desde);
    valor = total && total > 0 ? Math.round(((conv ?? 0) / total) * 100) : 0;
  } else if (metrica === "tempo_resposta_p95") {
    // Estimativa simples: não temos coluna de latência em leads — retorna placeholder
    valor = 0;
  }

  // Série temporal simplificada: últimos 7 pontos semanais (ou diários se 7d)
  const pontos = dias <= 7 ? dias : 7;
  const intervaloMs = (dias * 86_400_000) / pontos;
  for (let i = 0; i < pontos; i++) {
    const d = new Date(Date.now() - (pontos - 1 - i) * intervaloMs);
    serieTemporal.push({
      data: d.toISOString().slice(0, 10),
      valor: Math.round(valor * (0.6 + Math.random() * 0.8)),
    });
  }
  // Último ponto = valor real
  if (serieTemporal.length > 0) serieTemporal[serieTemporal.length - 1].valor = valor;

  const resultado = {
    ok: true,
    dados: {
      tipo: "grafico_kpi" as const,
      metrica,
      periodo,
      valor,
      serie_temporal: serieTemporal,
      variacao_pct: variacaoPct,
    },
    mensagem: `Métrica ${metrica} no período ${periodo}: ${valor}${metrica === "taxa_conversao" ? "%" : ""}.`,
  };
  return JSON.stringify(resultado);
}

// ---------------------------------------------------------------------------
/**
 * Rótulo humano do lead: leads de WhatsApp muitas vezes têm `name` = telefone
 * (ou vazio) — nesses casos vira "Contato final NNNN" pra resposta não tratar
 * gente como número (pedido Theus 2026-07-10).
 */
export function rotuloLead(name: unknown, phone: unknown): string {
  const nome = String(name ?? "").trim();
  const tel = String(phone ?? "").trim();
  const soDigitos = nome.replace(/[\s()+.-]/g, "");
  const pareceTelefone = /^\d{8,}$/.test(soDigitos);
  if (!nome || pareceTelefone || nome === tel) {
    const fim = tel.replace(/\D/g, "").slice(-4) || "????";
    return `Contato final ${fim}`;
  }
  return nome;
}

// listar_leads_recentes — retorna lista de leads do tenant
// ---------------------------------------------------------------------------
export async function handlerListarLeadsRecentes(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const filtro = String(args.filtro ?? "");
  const limite = Math.min(Number(args.limite ?? 10), 50);

  let query = ctx.supabase_admin
    .from("leads")
    .select("id, name, phone, temperatura_lead, fase_pipeline, updated_at")
    .eq("tenant_id", ctx.user_id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limite);

  if (filtro === "quente") query = query.eq("temperatura_lead", "quente");
  else if (filtro === "frio") query = query.eq("temperatura_lead", "frio");
  else if (filtro === "novo") {
    const ontemIso = new Date(Date.now() - 86_400_000).toISOString();
    query = query.gte("created_at", ontemIso);
  } else if (filtro === "inativo") {
    const seissDiasAtras = new Date(Date.now() - 6 * 86_400_000).toISOString();
    query = query.lte("updated_at", seissDiasAtras);
  }

  const { data, error } = await query;
  if (error) return fmt({ sucesso: false, mensagem: error.message });

  const leads = (data ?? []).map((l) => ({ ...l, name: rotuloLead(l.name, l.phone) }));
  const resultado = {
    ok: true,
    dados: { tipo: "lista_leads" as const, leads },
    mensagem: `${leads.length} lead(s) encontrado(s).`,
  };
  return JSON.stringify(resultado);
}

/**
 * buscar_leads_inteligente — acha leads pelo SIGNIFICADO do que falaram/querem
 * (não por filtro de coluna). Embeda a busca (Voyage query) e chama a RPC
 * `buscar_leads_por_significado` (RRF tenant-wide sobre os fatos de `memoria_lead`,
 * agrupados por lead). Devolve Gen UI `lista_leads` com o fato que fez cada lead
 * aparecer. Filtro opcional `inativo_ha_dias` = "parou de responder" (v1: proxy
 * por `updated_at`; refinar pra direção da última mensagem é tijolo futuro).
 */
export async function handlerBuscarLeadsInteligente(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const busca = String(args.busca ?? "").trim();
  if (!busca) {
    return fmt({ sucesso: false, mensagem: "Descreva o que os leads falaram ou querem (campo 'busca')." });
  }
  const limite = Math.min(Math.max(Number(args.limite ?? 12), 1), 30);
  const inativoDias = Math.max(Number(args.inativo_ha_dias ?? 0), 0);

  // Embedding da busca — input_type=query (assimetria Voyage com os fatos).
  const { gerarEmbeddingQuery, EMBED_DIM } = await import("./tools-internas.ts");
  const embedding = await gerarEmbeddingQuery(ctx.supabase_admin, busca);
  if (!embedding || embedding.length !== EMBED_DIM) {
    return fmt({ sucesso: false, mensagem: "Falha ao gerar embedding (Cohere) — verifique o provedor." });
  }

  // RPC tenant-wide. Com filtro de inatividade, pede mais candidatos pra não esvaziar.
  const { data, error } = await ctx.supabase_admin.rpc("buscar_leads_por_significado", {
    p_tenant_id: ctx.user_id,
    p_query_text: busca,
    p_query_embedding: embedding,
    p_match_count: inativoDias > 0 ? limite * 3 : limite,
  });
  if (error) return fmt({ sucesso: false, mensagem: `Busca de leads falhou: ${error.message}` });

  // deno-lint-ignore no-explicit-any
  let achados = (data as any[]) ?? [];

  // "Parou de responder" (v1): sem atividade há N dias (proxy via updated_at).
  if (inativoDias > 0) {
    const corte = new Date(Date.now() - inativoDias * 86_400_000).toISOString();
    achados = achados.filter((l) => l.updated_at && l.updated_at <= corte);
  }
  achados = achados.slice(0, limite);

  // Formato da Gen UI lista_leads (id + campos do lead + o fato que casou).
  const leads = achados.map((l) => ({
    id: l.lead_id,
    // Lead sem nome (ou com name = telefone): rótulo humano em vez do número cru.
    name: rotuloLead(l.name, l.phone),
    phone: l.phone,
    temperatura_lead: l.temperatura_lead,
    fase_pipeline: l.fase_pipeline,
    updated_at: l.updated_at,
    fato_match: l.fato_match,
    categoria: l.categoria,
  }));

  const sufixo = inativoDias > 0 ? ` parados há ${inativoDias}+ dia(s)` : "";
  return JSON.stringify({
    ok: true,
    dados: { tipo: "lista_leads", leads, busca, modo: "semantico" },
    mensagem: leads.length > 0
      ? `${leads.length} lead(s) que combinam com "${busca}"${sufixo}.`
      : `Nenhum lead${sufixo} combinou com "${busca}".`,
  });
}

// ---------------------------------------------------------------------------
// dashboard_resumo — agrega cards de visão geral do tenant
// ---------------------------------------------------------------------------
export async function handlerDashboardResumo(
  _args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const sb = ctx.supabase_admin;
  const uid = ctx.user_id;
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [
    { count: totalLeads },
    { count: leadsQuentes },
    { count: conversasAtivas },
    { count: msgsDia },
    { count: conversoesMes },
  ] = await Promise.all([
    sb.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", uid).is("deleted_at", null),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", uid).eq("temperatura_lead", "quente").is("deleted_at", null),
    sb.from("conversas").select("id", { count: "exact", head: true }).eq("tenant_id", uid).eq("status", "ativa"),
    sb.from("mensagens").select("id", { count: "exact", head: true }).eq("tenant_id", uid).gte("created_at", inicioDia.toISOString()),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", uid).not("fase_cliente", "is", null).gte("updated_at", inicioMes.toISOString()),
  ]);

  const cards = [
    { titulo: "Total de leads", valor: totalLeads ?? 0, icone: "Users" },
    { titulo: "Leads quentes", valor: leadsQuentes ?? 0, icone: "Flame" },
    { titulo: "Conversas ativas", valor: conversasAtivas ?? 0, icone: "MessageCircle" },
    { titulo: "Msgs hoje", valor: msgsDia ?? 0, icone: "Zap" },
    { titulo: "Conversões no mês", valor: conversoesMes ?? 0, icone: "TrendingUp" },
  ];

  const resultado = {
    ok: true,
    dados: { tipo: "dashboard" as const, cards },
    mensagem: `Dashboard: ${totalLeads ?? 0} leads, ${leadsQuentes ?? 0} quentes, ${conversasAtivas ?? 0} conversas ativas.`,
  };
  return JSON.stringify(resultado);
}

// ---------------------------------------------------------------------------
// abrir_app_os — sinaliza ao frontend pra abrir um app no Desktop OS
// ---------------------------------------------------------------------------
export async function handlerAbrirAppOs(
  args: Record<string, unknown>,
  _ctx: CtxMentor,
): Promise<string> {
  const slug = String(args.slug ?? "").trim();
  if (!slug) return fmt({ sucesso: false, mensagem: "slug do app não informado." });
  const resultado = {
    ok: true,
    dados: { tipo: "acao_os" as const, acao: "abrir_app", slug },
    mensagem: `App ${slug} aberto.`,
  };
  return JSON.stringify(resultado);
}

// ---------------------------------------------------------------------------
// mostrar_desktop_os — minimiza todas as janelas
// ---------------------------------------------------------------------------
export async function handlerMostrarDesktop(
  _args: Record<string, unknown>,
  _ctx: CtxMentor,
): Promise<string> {
  const resultado = {
    ok: true,
    dados: { tipo: "acao_os" as const, acao: "mostrar_desktop" },
    mensagem: "Desktop visível.",
  };
  return JSON.stringify(resultado);
}

// ---------------------------------------------------------------------------
// criar_anotacao_mentor — grava nota de longo prazo do Mentor
// Nota: a tabela mentor_anotacoes será criada pela Frente D parte 2.
// ---------------------------------------------------------------------------
export async function handlerCriarAnotacaoMentor(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const conteudo = String(args.conteudo ?? "").trim();
  if (!conteudo) return fmt({ sucesso: false, mensagem: "conteudo da anotação é obrigatório." });

  const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];

  const { data, error } = await ctx.supabase_admin
    .from("mentor_anotacoes")
    .insert({ owner_id: ctx.user_id, conteudo, tags })
    .select("id")
    .single();

  if (error) return fmt({ sucesso: false, mensagem: error.message });

  const resultado = {
    ok: true,
    dados: { tipo: "confirmacao" as const, acao: "anotacao_criada", id: data?.id },
    mensagem: "Anotação salva.",
  };
  return JSON.stringify(resultado);
}

// ---------------------------------------------------------------------------
// App Contratos · Onda 3 (2026-05-13) — agente mestre como fábrica
// ---------------------------------------------------------------------------

/**
 * Detecta placeholders em texto cru. Estratégia híbrida (pragmática):
 *  1) Regex de padrões explícitos: {{snake_case}}, {SNAKE_CASE},
 *     [NOME], ___nome___, <<placeholder>>.
 *  2) Normaliza tudo pra {{snake_case}} consistente.
 *  3) Devolve lista [{nome, descricao, tipo}] pronta pra coluna placeholders jsonb.
 *  Quando regex retorna [], handler chama `inferirPlaceholdersComLLM` (Onda 3-b).
 */
export function detectarPlaceholders(
  texto: string,
): Array<{ nome: string; descricao: string; tipo: string }> {
  const padroes: RegExp[] = [
    /\{\{([a-z0-9_]+)\}\}/gi,
    /\{([A-Z_]{3,})\}/g,
    /\[([A-Z_]{3,})\]/g,
    /___([a-z0-9_]+)___/gi,
    /<<([a-z0-9_]+)>>/gi,
  ];
  const nomes = new Set<string>();
  for (const p of padroes) {
    const matches = texto.matchAll(p);
    for (const m of matches) {
      const raw = m[1].toLowerCase();
      // ignora tags condicionais legado ({SE_A_VISTA} etc)
      if (raw.startsWith("se_") || raw.startsWith("/se_")) continue;
      nomes.add(raw);
    }
  }
  const descricoesCanonicas: Record<string, string> = {
    nome_completo: "Nome completo do cliente",
    nome: "Nome do cliente",
    nome_cliente: "Nome do cliente",
    cpf: "CPF do cliente",
    rg: "RG do cliente",
    cnpj: "CNPJ",
    email: "E-mail do cliente",
    telefone: "Telefone do cliente",
    endereco: "Endereço do cliente",
    cidade: "Cidade",
    estado: "Estado",
    cep: "CEP",
    bairro: "Bairro",
    valor: "Valor do contrato",
    data: "Data do contrato",
    produto: "Produto contratado",
  };
  return Array.from(nomes).map((nome) => ({
    nome,
    descricao: descricoesCanonicas[nome] || `Valor para ${nome.replaceAll("_", " ")}`,
    tipo: nome.includes("data") ? "data" : nome === "valor" ? "valor_brl" : "texto",
  }));
}

/**
 * Onda 3-b · LLM auxiliar pra texto cru SEM padrão explícito.
 * Pergunta a gemma quais placeholders fazem sentido cravar pra reuso.
 * Retorna até 12 sugestões em snake_case com descrição + tipo.
 * Lê credencial OpenRouter de `provedores_llm` (slug 'openrouter').
 */
export async function inferirPlaceholdersComLLM(
  texto: string,
  supabase: SupabaseClient,
): Promise<Array<{ nome: string; descricao: string; tipo: string }>> {
  try {
    const { data: prov } = await supabase
      .from("provedores_llm")
      .select("api_key, base_url")
      .eq("slug", "openrouter")
      .maybeSingle();
    if (!prov?.api_key) {
      console.warn("[inferir-placeholders] sem credencial openrouter — pulando inferência.");
      return [];
    }
    const baseUrl = (prov.base_url || "https://openrouter.ai/api/v1").replace(/\/$/, "");
    const trecho = texto.length > 8000 ? texto.slice(0, 8000) + "\n\n[...truncado...]" : texto;

    const prompt = `Você é especialista em contratos brasileiros. Lendo o trecho abaixo, identifique até 12 VARIÁVEIS (placeholders) que fariam sentido cravar como campos editáveis pra reuso desse contrato como template. Retorne APENAS JSON válido sem markdown, no formato:\n{"placeholders":[{"nome":"snake_case","descricao":"frase curta pt-BR","tipo":"texto|valor_brl|data|email|telefone"}]}\n\nRegras:\n- nome em snake_case minúsculo, sem acento, sem espaço. Ex: nome_completo, cpf, valor_total, data_assinatura.\n- descrição em pt-BR, 3-6 palavras.\n- tipo: "valor_brl" se for dinheiro, "data" se for data, "email", "telefone" ou "texto".\n- Se o contrato não tem variáveis óbvias, retorne {"placeholders":[]}.\n\nTRECHO:\n${trecho}`;

    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${prov.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemma-3-27b-it",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 800,
      }),
    });
    if (!r.ok) {
      console.warn("[inferir-placeholders] OpenRouter erro:", r.status);
      return [];
    }
    const json = await r.json();
    const conteudo: string = json?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(conteudo);
    const lista = Array.isArray(parsed?.placeholders) ? parsed.placeholders : [];

    const TIPOS_VALIDOS = new Set(["texto", "valor_brl", "data", "email", "telefone"]);
    return lista
      .filter((p: unknown): p is { nome: string; descricao?: string; tipo?: string } => {
        return typeof p === "object" && p !== null && typeof (p as { nome?: unknown }).nome === "string";
      })
      .slice(0, 12)
      .map((p: { nome: string; descricao?: string; tipo?: string }) => ({
        nome: String(p.nome).toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_"),
        descricao: String(p.descricao ?? `Valor para ${String(p.nome).replaceAll("_", " ")}`),
        tipo: TIPOS_VALIDOS.has(String(p.tipo)) ? String(p.tipo) : "texto",
      }));
  } catch (e) {
    console.warn("[inferir-placeholders] falhou:", e);
    return [];
  }
}

export async function handlerGerarLinkContratoLivre(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const texto = String(args.texto ?? "").trim();
  if (!texto) return fmt({ sucesso: false, mensagem: "texto do contrato obrigatório." });
  const titulo = String(args.titulo ?? "Contrato");
  const lead_id = args.lead_id ? String(args.lead_id) : null;
  const conversa_id = args.conversa_id ? String(args.conversa_id) : null;

  const { data, error } = await ctx.supabase_admin.rpc("criar_contrato_livre", {
    p_texto: texto,
    p_titulo: titulo,
    p_lead_id: lead_id,
    p_conversa_id: conversa_id,
    p_dados_cliente: {},
    p_origem: "mestre_livre",
    p_tenant_id: ctx.user_id, // service_role não tem auth.uid() — passa o dono explícito
  });

  if (error || !data?.[0]) {
    return fmt({ sucesso: false, mensagem: error?.message ?? "falha ao criar contrato." });
  }

  const { id, chave_publica } = data[0] as { id: string; chave_publica: string };

  const resultado = {
    ok: true,
    dados: {
      tipo: "link_contrato" as const,
      contrato_id: id,
      chave_publica,
      url_publica: `/contrato/${chave_publica}`,
      titulo,
    },
    mensagem: `Contrato "${titulo}" criado. Link de assinatura: /contrato/${chave_publica}`,
  };
  return JSON.stringify(resultado);
}

export async function handlerCriarTemplateContrato(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const nome = String(args.nome ?? "").trim();
  const texto = String(args.texto ?? "").trim();
  if (!nome) return fmt({ sucesso: false, mensagem: "nome do template obrigatório." });
  if (!texto) return fmt({ sucesso: false, mensagem: "texto do template obrigatório." });
  const ativar = args.ativar === true;
  const produto_id = args.produto_id ? String(args.produto_id) : null;

  let placeholders = detectarPlaceholders(texto);
  let inferido_por_llm = false;
  if (placeholders.length === 0) {
    placeholders = await inferirPlaceholdersComLLM(texto, ctx.supabase_admin);
    inferido_por_llm = placeholders.length > 0;
  }

  const { data, error } = await ctx.supabase_admin.rpc("criar_template_a_partir_de_texto", {
    p_nome: nome,
    p_texto: texto,
    p_placeholders: placeholders,
    p_produto_id: produto_id,
    p_num_testemunhas: 1,
    p_instrucao_selfie: null,
    p_ativar: ativar,
  });

  if (error || !data?.[0]) {
    return fmt({ sucesso: false, mensagem: error?.message ?? "falha ao criar template." });
  }

  const { id, chunks_rag_gerados } = data[0] as { id: string; chunks_rag_gerados: number };

  const origem = inferido_por_llm ? " · inferidos pela IA (revise os nomes)" : "";
  const resultado = {
    ok: true,
    dados: {
      tipo: "confirmacao_placeholders" as const,
      template_id: id,
      nome,
      placeholders,
      ativo: ativar,
      chunks_rag_gerados,
      inferido_por_llm,
    },
    mensagem: ativar
      ? `Template "${nome}" criado e ativado. ${placeholders.length} placeholder(s) detectado(s)${origem} · ${chunks_rag_gerados} bloco(s) de RAG gerado(s) pro agente.`
      : `Template "${nome}" criado como rascunho com ${placeholders.length} placeholder(s) detectado(s)${origem}. Ative quando quiser que o agente o use.`,
  };
  return JSON.stringify(resultado);
}

// ---------------------------------------------------------------------------
// Dispatcher central
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// gerar_link_contrato_de_produto · 2026-05-28
//
// Mentor recebe "quero link de contrato pro <produto>" → busca produto ativo
// do tenant por nome (ILIKE) → resolve template ativo desse produto
// (produto_id explícito > template guarda-chuva produto_id IS NULL) → chama
// RPC `criar_contrato_livre_de_template`. Página pública abre idêntica à do
// agente (branding + placeholders). Sem texto do tenant — o template é a base.
// ---------------------------------------------------------------------------
export async function handlerGerarLinkContratoDeProduto(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const produtoNome = String(args.produto_nome ?? "").trim();
  if (!produtoNome) {
    return fmt({ sucesso: false, mensagem: "produto_nome obrigatório." });
  }

  // ── Todos os produtos ativos do tenant ──
  const { data: produtos, error: errProd } = await ctx.supabase_admin
    .from("produtos")
    .select("id, nome")
    .eq("user_id", ctx.user_id)
    .eq("ativo", true);

  if (errProd) {
    return fmt({ sucesso: false, mensagem: `erro ao buscar produto: ${errProd.message}` });
  }
  const lista = (produtos ?? []) as Array<{ id: string; nome: string }>;
  if (lista.length === 0) {
    return fmt({
      sucesso: false,
      mensagem: "Nenhum produto cadastrado. Cadastre um produto antes de gerar contrato por template.",
    });
  }

  // ── Resolve o produto por SIGNIFICADO (RAG de ação em runtime) ──
  // 1 produto → usa direto. Vários → embeda o termo + os nomes (Voyage voyage-4)
  // e pega o mais próximo por cosseno (piso 0.30). Embedding indisponível →
  // fallback ilike literal. Sem match confiável → pede pro tenant escolher.
  let produto: { id: string; nome: string } | null = null;
  let modoResolucao = "unico";

  if (lista.length === 1) {
    produto = lista[0];
  } else {
    const { embeddarLote, cosseno } = await import("./tools-rag.ts");
    const vetores = await embeddarLote(ctx.supabase_admin, [produtoNome, ...lista.map((p) => p.nome)]);
    if (vetores && vetores.length === lista.length + 1) {
      const [qv, ...pvs] = vetores;
      const scores = pvs.map((pv) => cosseno(qv, pv));
      let melhorIdx = 0;
      scores.forEach((s, i) => { if (s > scores[melhorIdx]) melhorIdx = i; });
      const melhorScore = scores[melhorIdx];
      const segundoScore = scores.reduce((m, s, i) => (i === melhorIdx ? m : Math.max(m, s)), -1);
      // Aceita o top-1 se tem sinal mínimo (0.18) E se destaca do 2º (margem 0.04).
      // Embeddings Cohere de nome curto vs frase ficam em ~0.2-0.45; piso absoluto
      // alto barraria casos reais ("tirar do serasa" -> Limpa Nome ~0.23). A margem
      // evita gerar errado pra termo fora do catálogo (scores baixos e colados).
      // AÇÃO que cria contrato → só gera direto com ALTA confiança (score >= 0.40 +
      // margem >= 0.08 do 2º). Confiança média → devolve o palpite pra CONFIRMAÇÃO
      // (a próxima chamada com o nome exato cai em alta confiança e gera). Embeddings
      // de nome curto não separam termo-certo de termo-fora; por isso não gera às cegas.
      const alta = melhorScore >= 0.40 && (melhorScore - segundoScore) >= 0.08;
      if (alta) {
        produto = lista[melhorIdx];
        modoResolucao = `semantico(${melhorScore.toFixed(3)})`;
      } else if (melhorScore >= 0.20) {
        return fmt({
          sucesso: false,
          mensagem: `Acho que você quer o produto "${lista[melhorIdx].nome}" — confirma que gero o contrato dele? (se for outro, me diz: ${lista.map((p) => p.nome).join(", ")})`,
        });
      }
    } else {
      const termo = produtoNome.toLowerCase();
      const achados = lista.filter((p) => p.nome.toLowerCase().includes(termo));
      if (achados.length === 1) {
        produto = achados[0];
        modoResolucao = "ilike";
      }
    }
    if (!produto) {
      const nomes = lista.map((p) => p.nome).join(", ");
      return fmt({
        sucesso: false,
        mensagem: `Não consegui identificar com certeza qual produto. Você tem: ${nomes}. Qual deles?`,
      });
    }
  }

  // ── Template ativo: produto_id explícito > guarda-chuva (produto_id IS NULL) ──
  const { data: templates, error: errTpl } = await ctx.supabase_admin
    .from("contratos_template")
    .select("id, nome, produto_id")
    .eq("user_id", ctx.user_id)
    .eq("ativo", true)
    .or(`produto_id.eq.${produto.id},produto_id.is.null`)
    .order("produto_id", { ascending: false, nullsFirst: false })
    .limit(1);

  if (errTpl) {
    return fmt({ sucesso: false, mensagem: `erro ao buscar template: ${errTpl.message}` });
  }

  const template = templates?.[0] as { id: string; nome: string; produto_id: string | null } | undefined;
  if (!template) {
    return fmt({
      sucesso: false,
      mensagem: `Achei o produto "${produto.nome}" mas ele não tem template de contrato ativo. Cadastra um template em /agente (aba Templates) e ativa.`,
    });
  }

  // ── Cria contrato via RPC (mesma página pública do agente) ──
  const { data, error } = await ctx.supabase_admin.rpc("criar_contrato_livre_de_template", {
    p_template_id: template.id,
    p_tenant_id: ctx.user_id, // service_role não tem auth.uid() — passa o dono explícito
  });

  if (error || !data?.[0]) {
    return fmt({ sucesso: false, mensagem: error?.message ?? "falha ao gerar contrato a partir do template." });
  }

  const { contrato_id, chave_publica } = data[0] as { contrato_id: string; chave_publica: string };

  const resultado = {
    ok: true,
    dados: {
      tipo: "link_contrato" as const,
      contrato_id,
      chave_publica,
      url_publica: `/contrato/${chave_publica}`,
      titulo: template.nome,
      produto: produto.nome,
      template_guarda_chuva: template.produto_id === null,
      resolucao: modoResolucao,
    },
    mensagem: `Contrato "${template.nome}" gerado pra ${produto.nome}. Link: /contrato/${chave_publica}`,
  };
  return JSON.stringify(resultado);
}

// ───────────────────────────────────────────────────────────────────────────
// gerar_imagem_post — 1º recurso do app Marketing (canal interno do dono via Mentor).
// O texto do pedido do tenant É a query do RAG (tenant+nicho+global, mesmo cano do
// motor: embedding Cohere v4 → busca_hibrida_conhecimento → rerank). O conhecimento
// recuperado tempera a arte — nada fixo. Gera via Nano Banana 2 (OpenRouter,
// modalities image + image_config) e salva no bucket público marketing-posts.
// ───────────────────────────────────────────────────────────────────────────
const FORMATOS_IMAGEM_POST: Record<string, { aspect_ratio: string; rotulo: string }> = {
  feed_quadrado: { aspect_ratio: "1:1", rotulo: "Feed quadrado (1:1)" },
  retrato: { aspect_ratio: "4:5", rotulo: "Retrato Instagram (4:5)" },
  story: { aspect_ratio: "9:16", rotulo: "Story / Reels (9:16)" },
  paisagem: { aspect_ratio: "16:9", rotulo: "Paisagem / Facebook / banner (16:9)" },
};

const MODELO_IMAGEM_POST = "google/gemini-3.1-flash-image-preview";

export async function handlerGerarImagemPost(
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  const descricao = String(args.descricao ?? "").trim();
  const formatoKey = String(args.formato ?? "feed_quadrado").toLowerCase();
  const fmtCfg = FORMATOS_IMAGEM_POST[formatoKey] ?? FORMATOS_IMAGEM_POST.feed_quadrado;
  if (!descricao) {
    return JSON.stringify({ ok: false, mensagem: "Descreva o que a imagem do post deve mostrar." });
  }

  const sb = ctx.supabase_admin;

  // 1. Credencial OpenRouter (mesma fonte do motor).
  const { data: prov } = await sb
    .from("provedores_llm")
    .select("api_key, base_url")
    .eq("slug", "openrouter")
    .maybeSingle();
  if (!prov?.api_key) {
    return JSON.stringify({ ok: false, mensagem: "Sem credencial OpenRouter configurada." });
  }
  const baseUrl = (prov.base_url || "https://openrouter.ai/api/v1").replace(/\/$/, "");

  // 2. RAG-first: o pedido do tenant É a query. Recupera blocos (tenant+nicho+global)
  //    pelo MESMO cano do motor (embedding Cohere v4 → busca_hibrida_conhecimento → rerank).
  const agente_id = await resolverAgenteId(sb, ctx.user_id);
  const { data: perfil } = await sb
    .from("profiles")
    .select("nicho_id")
    .eq("id", ctx.user_id)
    .maybeSingle();
  let baseConhecimento = "";
  try {
    const { recuperarBlocosRagFirst } = await import("./tools-internas.ts");
    const blocos = await recuperarBlocosRagFirst(sb, {
      query: descricao,
      agente_id,
      nicho_id: perfil?.nicho_id ?? null,
      limite: 6,
    });
    if (blocos.length > 0) {
      baseConhecimento = blocos
        .map((b) => `- ${b.title ? b.title + ": " : ""}${(b.content || "").slice(0, 400)}`)
        .join("\n");
    }
  } catch (e) {
    console.warn("[gerar_imagem_post] recall RAG falhou:", (e as Error).message ?? e);
  }

  // 3. Identidade da marca (contexto leve, não obrigatório).
  const { data: emp } = await sb
    .from("empresas")
    .select("nome, descricao")
    .eq("user_id", ctx.user_id)
    .maybeSingle();

  // 4. Monta o prompt do Nano Banana.
  const partes = [
    `Crie uma imagem de post para redes sociais no formato ${fmtCfg.rotulo}.`,
    `Pedido do usuário: ${descricao}`,
  ];
  if (emp?.nome) {
    partes.push(`Marca: ${emp.nome}${emp.descricao ? ` — ${emp.descricao}` : ""}.`);
  }
  if (baseConhecimento) {
    partes.push(
      `Use como base de conhecimento da marca (fiel a estes fatos, sem inventar):\n${baseConhecimento}`,
    );
  }
  partes.push(
    "Qualquer texto escrito na imagem deve estar em português do Brasil com acentuação correta. Frases curtas e legíveis.",
  );
  const promptImagem = partes.join("\n\n");

  // 5. Geração via OpenRouter (modalities image + image_config pro tamanho).
  let dataUrl = "";
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${prov.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO_IMAGEM_POST,
        messages: [{ role: "user", content: promptImagem }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: fmtCfg.aspect_ratio, image_size: "2K" },
      }),
    });
    if (!r.ok) {
      console.warn("[gerar_imagem_post] OpenRouter erro:", r.status);
      return JSON.stringify({ ok: false, mensagem: `Falha na geração da imagem (HTTP ${r.status}).` });
    }
    const json = await r.json();
    // deno-lint-ignore no-explicit-any
    const imgs = json?.choices?.[0]?.message?.images as Array<{ image_url?: { url?: string } }> | undefined;
    dataUrl = imgs?.[0]?.image_url?.url ?? "";
  } catch (e) {
    console.warn("[gerar_imagem_post] fetch falhou:", (e as Error).message ?? e);
    return JSON.stringify({ ok: false, mensagem: "Erro ao chamar o gerador de imagem." });
  }
  if (!dataUrl.startsWith("data:image/")) {
    return JSON.stringify({ ok: false, mensagem: "O modelo não retornou imagem. Tente reformular o pedido." });
  }

  // 6. data URL → bytes → upload no bucket público marketing-posts.
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const agora = new Date();
  const yyyymm = `${agora.getUTCFullYear()}_${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
  const path = `${ctx.user_id}/${yyyymm}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await sb.storage.from("marketing-posts").upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) {
    console.warn("[gerar_imagem_post] upload falhou:", upErr.message);
    return JSON.stringify({ ok: false, mensagem: `Imagem gerada mas falhou ao salvar: ${upErr.message}` });
  }
  const { data: pub } = sb.storage.from("marketing-posts").getPublicUrl(path);
  const url = pub?.publicUrl ?? "";

  return JSON.stringify({
    ok: true,
    dados: {
      tipo: "imagem_post",
      url,
      formato: formatoKey,
      aspect_ratio: fmtCfg.aspect_ratio,
      descricao,
    },
    mensagem: `Imagem de post gerada (${fmtCfg.rotulo}).`,
  });
}

export async function executarTool(
  nome: string,
  args: Record<string, unknown>,
  ctx: CtxMentor,
): Promise<string> {
  switch (nome) {
    case "abrir_app":
      return handlerAbrirApp(args, ctx);
    case "cadastrar_produto":
      return handlerCadastrarProduto(args, ctx);
    case "criar_cliente":
      return handlerCriarCliente(args, ctx);
    case "atualizar_empresa":
      return handlerAtualizarEmpresa(args, ctx);
    case "criar_categoria":
      return handlerCriarCategoria(args, ctx);
    case "cadastrar_bloco_conhecimento":
      return handlerCadastrarBlocoConhecimento(args, ctx);
    case "gerar_link_contrato_livre":
      return handlerGerarLinkContratoLivre(args, ctx);
    case "gerar_link_contrato_de_produto":
      return handlerGerarLinkContratoDeProduto(args, ctx);
    case "criar_template_contrato":
      return handlerCriarTemplateContrato(args, ctx);
    case "mostrar_kpi":
      return handlerMostrarKpi(args, ctx);
    case "listar_leads_recentes":
      return handlerListarLeadsRecentes(args, ctx);
    case "buscar_leads_inteligente":
      return handlerBuscarLeadsInteligente(args, ctx);
    case "dashboard_resumo":
      return handlerDashboardResumo(args, ctx);
    case "abrir_app_os":
      return handlerAbrirAppOs(args, ctx);
    case "mostrar_desktop":
      return handlerMostrarDesktop(args, ctx);
    case "criar_anotacao_mentor":
      return handlerCriarAnotacaoMentor(args, ctx);
    case "gerar_imagem_post":
      return handlerGerarImagemPost(args, ctx);
    default:
      return `Tool desconhecida: "${nome}".`;
  }
}

// ---------------------------------------------------------------------------
// Catálogo de tools (schemas OpenAI tool-calling)
// ---------------------------------------------------------------------------

export const TOOLS_MENTOR: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "gerar_imagem_post",
      description:
        "Gera uma IMAGEM de post para redes sociais (app Marketing). Use quando o usuário pedir pra criar, gerar ou fazer uma arte, post, imagem, criativo ou banner. O texto do pedido vira a busca na base de conhecimento da marca (tenant + nicho + global) e tempera a arte — seja fiel aos fatos recuperados, não invente. NUNCA descreva a imagem em texto como se ela já existisse: emita esta tool pra de fato gerá-la.",
      parameters: {
        type: "object",
        properties: {
          descricao: {
            type: "string",
            description:
              "O que a imagem deve mostrar, com o máximo da intenção do usuário (tema, oferta, estilo e qualquer texto que deva aparecer escrito na arte).",
          },
          formato: {
            type: "string",
            enum: ["feed_quadrado", "retrato", "story", "paisagem"],
            description:
              "Formato da arte: feed_quadrado (1:1), retrato (4:5 Instagram), story (9:16 Story/Reels), paisagem (16:9 Facebook/banner). Default feed_quadrado.",
          },
        },
        required: ["descricao"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "abrir_app",
      description:
        "Solicita ao frontend que abra um app específico no desktop OS. Use quando o usuário pedir pra abrir, acessar ou navegar para alguma tela.",
      parameters: {
        type: "object",
        properties: {
          app_id: {
            type: "string",
            description:
              "Identificador do app (ex: 'produtos', 'clientes', 'agente', 'financeiro', 'contratos', 'conhecimento', 'empresa', 'categorias').",
          },
        },
        required: ["app_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_produto",
      description:
        "Cadastra um novo produto no sistema do tenant. Use quando o usuário pedir pra criar, adicionar ou cadastrar um produto.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do produto." },
          descricao: { type: "string", description: "Descrição curta do produto." },
          categoria_id: {
            type: "string",
            description: "UUID da categoria do produto (opcional).",
          },
        },
        required: ["nome"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_cliente",
      description:
        "Cadastra um novo cliente (lead convertido) no sistema. Use quando o usuário informar dados de um cliente.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome completo do cliente." },
          telefone: { type: "string", description: "Telefone do cliente (com DDD)." },
          email: { type: "string", description: "E-mail do cliente (opcional)." },
        },
        required: ["nome", "telefone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_empresa",
      description:
        "Atualiza dados da empresa do tenant. Use quando o usuário quiser editar o perfil, nome, CNPJ, endereço ou telefone da empresa.",
      parameters: {
        type: "object",
        properties: {
          nome_fantasia: { type: "string", description: "Nome fantasia da empresa." },
          cnpj: { type: "string", description: "CNPJ da empresa." },
          endereco: { type: "string", description: "Endereço completo." },
          telefone: { type: "string", description: "Telefone de contato da empresa." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_categoria",
      description:
        "Cria uma nova categoria de produto. Use quando o usuário pedir pra criar, adicionar ou cadastrar uma categoria.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome da categoria." },
          descricao: { type: "string", description: "Descrição da categoria (opcional)." },
        },
        required: ["nome"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mostrar_kpi",
      description:
        "Mostra um KPI visual do tenant com série temporal. Use quando o usuário perguntar sobre métricas, números, desempenho ou indicadores.",
      parameters: {
        type: "object",
        properties: {
          metrica: {
            type: "string",
            enum: ["leads_quentes", "conversoes_mes", "tempo_resposta_p95", "taxa_conversao"],
            description: "Qual métrica exibir.",
          },
          periodo: {
            type: "string",
            enum: ["7d", "30d", "90d"],
            description: "Período de análise (padrão: 30d).",
          },
        },
        required: ["metrica"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_leads_recentes",
      description:
        "Lista leads recentes do tenant com filtro opcional. Use quando o usuário quiser ver, checar ou buscar leads.",
      parameters: {
        type: "object",
        properties: {
          filtro: {
            type: "string",
            enum: ["quente", "frio", "novo", "inativo"],
            description: "Filtrar por temperatura ou recência (opcional).",
          },
          limite: {
            type: "number",
            description: "Quantidade máxima de leads a retornar (padrão: 10, máx: 50).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_leads_inteligente",
      description:
        "Busca leads do tenant pelo SIGNIFICADO do que falaram, demonstraram ou querem nas conversas — não por filtro de coluna. Use quando o usuário descrever leads por intenção, interesse, objeção ou situação. Ex: 'leads que queriam fechar', 'quem falou de preço', 'interessados em limpar nome de CNPJ', 'quem tá negativado'. Acha pelo sentido nos fatos memorizados de cada lead e devolve a lista com o fato que casou. Para leads que 'pararam de responder' ou 'sumiram', passe inativo_ha_dias. PREFIRA esta tool a listar_leads_recentes sempre que houver uma descrição do que o lead disse/quer.",
      parameters: {
        type: "object",
        properties: {
          busca: {
            type: "string",
            description:
              "Descrição em linguagem natural do que os leads falaram ou querem. Ex: 'queriam fechar e sumiram', 'interesse em limpar nome CNPJ', 'reclamaram do preço'.",
          },
          inativo_ha_dias: {
            type: "number",
            description:
              "Opcional. Só traz leads sem atividade há pelo menos N dias (1 = parados desde ontem). Use quando o usuário disser que os leads 'pararam de responder' ou 'sumiram'.",
          },
          limite: {
            type: "number",
            description: "Máximo de leads a retornar (padrão: 12, máx: 30).",
          },
        },
        required: ["busca"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dashboard_resumo",
      description:
        "Exibe um painel resumo com cards de visão geral do tenant. Use quando o usuário pedir resumo, visão geral ou dashboard.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "abrir_app_os",
      description:
        "Solicita ao Desktop OS que abra um app pelo slug. Use quando o usuário pedir pra navegar para uma tela específica.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description:
              "Slug do app no Desktop OS (ex: 'atendimento', 'campanha', 'curadoria', 'painel', 'agente', 'whatsapp').",
          },
        },
        required: ["slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mostrar_desktop",
      description:
        "Minimiza todas as janelas e revela o desktop. Use quando o usuário pedir pra mostrar o desktop ou limpar a tela.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_anotacao_mentor",
      description:
        "Salva uma anotação de longo prazo para o Mentor se lembrar entre sessões. Use quando o usuário pedir pra anotar, lembrar ou registrar algo importante.",
      parameters: {
        type: "object",
        properties: {
          conteudo: {
            type: "string",
            description: "Texto da anotação.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags para categorizar a anotação (opcional).",
          },
        },
        required: ["conteudo"],
      },
    },
  },
  // ====================================================================
  // App Contratos · Onda 3 (2026-05-13)
  // ====================================================================
  {
    type: "function",
    function: {
      name: "gerar_link_contrato_livre",
      description:
        "Cria um contrato livre (sem template) a partir de um texto colado pelo tenant e retorna o link público de assinatura. Use quando o tenant cola/anexa texto de contrato e quer um link único pra UM cliente, sem virar modelo. NÃO use quando o tenant pedir contrato de um produto específico (use gerar_link_contrato_de_produto pra isso).",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string", description: "Texto completo do contrato." },
          titulo: { type: "string", description: "Título do contrato (ex: 'Contrato de Prestação')." },
          lead_id: { type: "string", description: "UUID do lead destinatário (opcional)." },
          conversa_id: { type: "string", description: "UUID da conversa relacionada (opcional)." },
        },
        required: ["texto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gerar_link_contrato_de_produto",
      description:
        "Gera link de contrato a partir de um produto cadastrado do tenant. Busca o template ativo desse produto (ou o template guarda-chuva sem produto vinculado) e cria contrato com mesmo branding e formulário que o agente entrega. Use quando o tenant pedir 'link de contrato pro <produto>' ou nomear um produto cadastrado. Se o tenant pedir 'link de contrato' SEM nomear produto, peça antes pra ele colar o texto e use gerar_link_contrato_livre.",
      parameters: {
        type: "object",
        properties: {
          produto_nome: {
            type: "string",
            description:
              "Nome (ou parte do nome) do produto cadastrado pra qual o tenant quer gerar contrato. Ex: 'limpa nome', 'consultoria fiscal'.",
          },
        },
        required: ["produto_nome"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_template_contrato",
      description:
        "Cria um template reutilizável de contrato a partir do texto colado/anexado, detectando automaticamente os placeholders (variáveis) e propondo cada um pra aprovação. Use quando o tenant quer transformar um texto em modelo reutilizável.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome curto do template (ex: 'Limpa Nome Padrão')." },
          texto: { type: "string", description: "Texto completo do contrato com ou sem placeholders." },
          produto_id: { type: "string", description: "UUID do produto a vincular (opcional)." },
          ativar: { type: "boolean", description: "Se true, ativa o template imediatamente e dispara a atomização RAG. Default false (rascunho)." },
        },
        required: ["nome", "texto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_bloco_conhecimento",
      description:
        "Cadastra um bloco de conhecimento (informação, FAQ, procedimento) que o agente pode usar no RAG. Use quando o usuário quiser ensinar algo ao agente.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título do bloco." },
          conteudo: { type: "string", description: "Conteúdo completo do bloco." },
          escopo: {
            type: "string",
            enum: ["tenant", "nicho"],
            description:
              "'tenant' para conhecimento exclusivo deste tenant, 'nicho' para compartilhar com o nicho.",
          },
        },
        required: ["titulo", "conteudo", "escopo"],
      },
    },
  },
];
