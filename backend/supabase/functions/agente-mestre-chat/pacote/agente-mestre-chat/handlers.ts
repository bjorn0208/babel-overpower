/**
 * Handlers das tools do Cargo Mentor.
 *
 * Cada handler recebe (args, ctx) e retorna string legível
 * que vai direto pra mensagem de retorno da tool no histórico LLM.
 *
 * ctx.supabase_admin usa service_role — bypassa RLS mas sempre
 * grava owner_id/agente_id correto resolvido do JWT do usuário.
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type CtxMentor = {
  user_id: string;
  supabase_admin: SupabaseClient;
};

export type ResultadoTool = {
  sucesso: boolean;
  mensagem: string;
  payload?: Record<string, unknown>;
};

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
  const desdeIso = new Date(Date.now() - dias * 86_400_000).toISOString();

  const sb = ctx.supabase_admin;
  let valor = 0;
  let serieTemporal: Array<{ data: string; valor: number }> = [];
  const variacaoPct: number | null = null;
  let mensagemExtra = "";

  // Série temporal REAL: agrupa eventos por dia — nunca inventar ponto.
  const seriePorDia = (eventos: Array<{ quando: string; peso: number }>) => {
    const porDia = new Map<string, number>();
    for (const e of eventos) {
      const dia = String(e.quando ?? "").slice(0, 10);
      if (!dia) continue;
      porDia.set(dia, (porDia.get(dia) ?? 0) + e.peso);
    }
    return [...porDia.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([data, v]) => ({ data, valor: Math.round(v * 100) / 100 }));
  };

  if (metrica === "leads_quentes") {
    const { data } = await sb
      .from("leads")
      .select("updated_at")
      .eq("tenant_id", ctx.user_id)
      .eq("temperatura_lead", "quente")
      .is("deleted_at", null)
      .gte("updated_at", desdeIso)
      .limit(2000);
    const linhas = (data ?? []) as Array<{ updated_at: string }>;
    valor = linhas.length;
    serieTemporal = seriePorDia(linhas.map((l) => ({ quando: l.updated_at, peso: 1 })));
  } else if (metrica === "vendas_mes" || metrica === "conversoes_mes") {
    const { data } = await sb
      .from("leads")
      .select("desfecho_em, valor_conversao")
      .eq("tenant_id", ctx.user_id)
      .eq("desfecho", "convertido")
      .is("deleted_at", null)
      .gte("desfecho_em", desdeIso)
      .limit(2000);
    const linhas = (data ?? []) as Array<{ desfecho_em: string; valor_conversao: number | null }>;
    if (metrica === "vendas_mes") {
      valor = Math.round(linhas.reduce((s, l) => s + (Number(l.valor_conversao) || 0), 0) * 100) / 100;
      serieTemporal = seriePorDia(linhas.map((l) => ({ quando: l.desfecho_em, peso: Number(l.valor_conversao) || 0 })));
      mensagemExtra = ` (${linhas.length} venda(s) no período)`;
    } else {
      valor = linhas.length;
      serieTemporal = seriePorDia(linhas.map((l) => ({ quando: l.desfecho_em, peso: 1 })));
    }
  } else if (metrica === "recebimentos_mes") {
    const [{ data: pagos }, { count: pendentes }] = await Promise.all([
      sb.from("pagamentos_cliente")
        .select("data_pagamento, valor")
        .eq("tenant_id", ctx.user_id)
        .eq("status", "pago")
        .gte("data_pagamento", desdeIso.slice(0, 10))
        .limit(2000),
      sb.from("pagamentos_cliente")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.user_id)
        .eq("status", "pendente")
        .not("origem_mensagem_id", "is", null),
    ]);
    const linhas = (pagos ?? []) as Array<{ data_pagamento: string; valor: number | null }>;
    valor = Math.round(linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0) * 100) / 100;
    serieTemporal = seriePorDia(linhas.map((l) => ({ quando: l.data_pagamento, peso: Number(l.valor) || 0 })));
    mensagemExtra = ` (${linhas.length} pagamento(s) confirmado(s)${(pendentes ?? 0) > 0 ? `; ${pendentes} comprovante(s) aguardando validação no app Financeiro — não entram no gráfico até validar` : ""})`;
  } else if (metrica === "taxa_conversao") {
    const [{ count: total }, { count: conv }] = await Promise.all([
      sb.from("leads").select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.user_id).is("deleted_at", null).gte("created_at", desdeIso),
      sb.from("leads").select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.user_id).is("deleted_at", null)
        .eq("desfecho", "convertido").gte("created_at", desdeIso),
    ]);
    valor = total && total > 0 ? Math.round(((conv ?? 0) / total) * 100) : 0;
  } else if (metrica === "tempo_resposta_p95") {
    valor = 0; // sem coluna de latência em leads — métrica ainda não instrumentada
  }

  const emReais = metrica === "vendas_mes" || metrica === "recebimentos_mes";
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
    mensagem: `Métrica ${metrica} no período ${periodo}: ${emReais ? `R$ ${valor.toFixed(2)}` : valor}${metrica === "taxa_conversao" ? "%" : ""}${mensagemExtra}.`,
  };
  return JSON.stringify(resultado);
}

// ---------------------------------------------------------------------------
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

  const resultado = {
    ok: true,
    dados: { tipo: "lista_leads" as const, leads: data ?? [] },
    mensagem: `${(data ?? []).length} lead(s) encontrado(s).`,
  };
  return JSON.stringify(resultado);
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
    // mensagens não tem tenant_id — filtra pelo tenant da conversa (join interno)
    sb.from("mensagens").select("id, conversas!inner(id)", { count: "exact", head: true }).eq("conversas.tenant_id", uid).gte("created_at", inicioDia.toISOString()),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", uid).eq("desfecho", "convertido").gte("desfecho_em", inicioMes.toISOString()),
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
function detectarPlaceholders(
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
async function inferirPlaceholdersComLLM(
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

    const prompt = `Você é especialista em contratos brasileiros. Lendo o trecho abaixo, identifique até 12 VARIÁVEIS (placeholders) que fariam sentido cravar como campos editáveis pra reuso desse contrato como template. Retorne APENAS JSON válido sem markdown, no formato:
{"placeholders":[{"nome":"snake_case","descricao":"frase curta pt-BR","tipo":"texto|valor_brl|data|email|telefone"}]}

Regras:
- nome em snake_case minúsculo, sem acento, sem espaço. Ex: nome_completo, cpf, valor_total, data_assinatura.
- descrição em pt-BR, 3-6 palavras.
- tipo: "valor_brl" se for dinheiro, "data" se for data, "email", "telefone" ou "texto".
- Se o contrato não tem variáveis óbvias, retorne {"placeholders":[]}.

TRECHO:
${trecho}`;

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
    case "criar_template_contrato":
      return handlerCriarTemplateContrato(args, ctx);
    case "mostrar_kpi":
      return handlerMostrarKpi(args, ctx);
    case "listar_leads_recentes":
      return handlerListarLeadsRecentes(args, ctx);
    case "dashboard_resumo":
      return handlerDashboardResumo(args, ctx);
    case "abrir_app_os":
      return handlerAbrirAppOs(args, ctx);
    case "mostrar_desktop":
      return handlerMostrarDesktop(args, ctx);
    case "criar_anotacao_mentor":
      return handlerCriarAnotacaoMentor(args, ctx);
    default:
      return `Tool desconhecida: "${nome}".`;
  }
}

