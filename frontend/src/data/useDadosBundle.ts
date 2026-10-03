import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { paginarTudo } from "@/data/paginar";

/**
 * Carrega datasets reais do Supabase e injeta em window.RAGENTIC_DATA.*
 * antes do bundle (App) montar. Cada PR estende este hook.
 *
 * Estratégia: o bundle inicializa estado com `useState(window.RAGENTIC_DATA.X)`,
 * então basta sobrescrever os arrays globais ANTES de renderizar <App />.
 */

function iniciais(nome: string): string {
  const partes = (nome || "?").trim().split(/\s+/).filter(Boolean);
  return (partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?");
}

async function carregarLeads(uid: string) {
  const data = await paginarTudo<any>(() => {
    const base = supabase
      .from("leads")
      .select("id, name, nome_exibicao, phone, fase_pipeline, temperatura_lead, total_mensagens, pontuacao, tags, created_at, tenant_id, assigned_to, is_hot, produto")
      .order("created_at", { ascending: false });
    // SEM exceção pro lado admin: dado de tenant é sempre do tenant logado.
    // Antes era `ehAdmin ? base : base.eq(...)` e a conta admin carregava lead de
    // TODOS os tenants (a RLS permite via eh_admin_plataforma()). Isso virava
    // visão geral não pedida — cliente de um aparecendo no app do outro.
    return base.eq("tenant_id", uid);
  }, { tamanho: 1000, maxPaginas: 10 });
  return (data || []).map((l: any) => ({
    id: l.id,
    nome: l.nome_exibicao || l.name || "Sem nome",
    avatar: iniciais(l.nome_exibicao || l.name || "?"),
    phone: l.phone || "",
    fase: l.fase_pipeline || "novo",
    cargo: "atendente",
    temperatura: l.temperatura_lead || "morno",
    hot: !!l.is_hot,
    msgs: l.total_mensagens || 0,
    pontuacao: l.pontuacao || 0,
    tags: l.tags || [],
    produto: l.produto || "",
    created: (l.created_at || "").slice(0, 10),
  }));
}

/* ============== PR-12: CONVERSAS + última mensagem (enriquece LEADS) ============== */

function deltaHumano(iso: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return iso.slice(0, 10);
}

async function carregarConversas(uid: string) {
  const conversas = await paginarTudo<any>(() => {
    const base = supabase
      .from("conversas")
      .select("id, lead_id, phone, status, agent_enabled, channel, tenant_id, agente_id, cargo_ativo_id, titulo, score_lead, created_at, updated_at, visto_em")
      .order("updated_at", { ascending: false });
    // Ver comentário em carregarLeads: sem exceção pro lado admin.
    return base.eq("tenant_id", uid);
  }, { tamanho: 1000, maxPaginas: 20 });
  const ids = conversas.map((c: any) => c.id);
  let ultimaPorConversa: Record<string, { content: string; created_at: string; role: string }> = {};

  if (ids.length) {
    // Carrega mensagens em lotes de IDs (PostgREST limita 1000 linhas/req).
    // Para puxar a "última msg por conversa" sem precisar de 1 query por
    // conversa, fatiamos os ids em blocos e paginamos cada bloco.
    const tamanhoBloco = 100; // ~100 conversas → poucas centenas de msgs/bloco
    for (let i = 0; i < ids.length; i += tamanhoBloco) {
      const bloco = ids.slice(i, i + tamanhoBloco);
      const msgs = await paginarTudo<any>(() =>
        supabase
          .from("mensagens")
          .select("conversation_id, role, content, created_at")
          .in("conversation_id", bloco)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        { tamanho: 1000, maxPaginas: 5 },
      );
      for (const m of msgs) {
        const cid = (m as any).conversation_id;
        if (!ultimaPorConversa[cid]) {
          ultimaPorConversa[cid] = {
            content: (m as any).content || "",
            created_at: (m as any).created_at,
            role: (m as any).role || "user",
          };
        }
      }
    }
  }

  const ultimaPorLead: Record<string, { preview: string; delta: string; updated_at: string }> = {};
  const out = conversas.map((c: any) => {
    const ult = ultimaPorConversa[c.id];
    const preview = ult?.content?.slice(0, 120) || "(sem mensagens ainda)";
    const ts = ult?.created_at || c.updated_at || c.created_at;
    const delta = deltaHumano(ts);
    if (c.lead_id) ultimaPorLead[c.lead_id] = { preview, delta, updated_at: ts };
    return {
      id: c.id,
      lead_id: c.lead_id,
      phone: c.phone || "",
      status: c.status || "aberta",
      agente_id: c.agente_id || null,
      cargo_ativo_id: c.cargo_ativo_id || null,
      ia_ativa: c.agent_enabled !== false,
      canal: c.channel || "whatsapp",
      titulo: c.titulo || "",
      score: c.score_lead || 0,
      criado: (c.created_at || "").slice(0, 16).replace("T", " "),
      atualizado: (c.updated_at || "").slice(0, 16).replace("T", " "),
      visto: c.visto_em ? deltaHumano(c.visto_em) : "—",
      preview,
      delta,
    };
  });

  return { conversas: out, ultimaPorLead };
}

/* ============== PR-12: CLIENTES (tabela própria) ============== */
async function carregarClientes(uid: string) {
  const data = await paginarTudo<any>(() => {
    const base = supabase
      .from("clientes")
      .select("id, nome, telefone, email, fonte, tags, dados, criado_em, owner_id")
      .is("deleted_at", null)
      .order("criado_em", { ascending: false });
    // Ver comentário em carregarLeads: sem exceção pro lado admin.
    return base.eq("owner_id", uid);
  }, { tamanho: 1000, maxPaginas: 10 });
  return (data || []).map((c: any) => ({
    id: c.id,
    nome: c.nome || "Sem nome",
    avatar: iniciais(c.nome || "?"),
    email: c.email || "",
    phone: c.telefone || "",
    fonte: c.fonte || "manual",
    tags: c.tags || [],
    dados: c.dados || {},
    criado: (c.criado_em || "").slice(0, 10),
  }));
}

/* ============== PR-12: PRODUTOS reais (catálogo do tenant) ============== */
async function carregarProdutosCatalogo(uid: string) {
  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome, slug, descricao_curta, palavras_chave, ativo, ordem, metadata")
    // `produtos` usa `user_id` como dono (alinhado com `carregarProdutosContrato`);
    // `owner_id` filtrava fora quase tudo (só 2 linhas legadas com owner_id).
    .eq("user_id", uid)
    .order("ordem", { ascending: true });
  if (error) { console.warn("[dados] produtos:", error.message); return []; }
  return (data || []).map((p: any) => ({
    id: p.id,
    nome: p.nome,
    slug: p.slug || "",
    descricao: p.descricao_curta || "",
    tags: p.palavras_chave || [],
    ativo: p.ativo !== false,
    metadata: p.metadata || {},
  }));
}

/* ============== PR-12: TEMPLATES de contrato ============== */
async function carregarContratoTemplates(uid: string) {
  const q = supabase
    .from("contratos_template")
    .select("id, user_id, produto_id, nome, blocos, conteudo, ativo, valor_a_vista, num_testemunhas, updated_at, created_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  // Ver comentário em carregarLeads: sem exceção pro lado admin.
  const { data, error } = await q.eq("user_id", uid);
  if (error) { console.warn("[dados] contratos_template:", error.message); return []; }
  return (data || []).map((t: any) => ({
    id: t.id,
    nome: t.nome || "Template sem nome",
    produto_id: t.produto_id || null,
    ativo: t.ativo !== false,
    valor_a_vista: Number(t.valor_a_vista || 0),
    testemunhas: t.num_testemunhas || 0,
    blocos: t.blocos || [],
    conteudo: t.conteudo || "",
    atualizado: (t.updated_at || t.created_at || "").slice(0, 10),
  }));
}

/* ============== PR-12: BASE DE CONHECIMENTO do produto ============== */
async function carregarConhecimentoProduto(uid: string) {
  // Pega produto_conhecimento dos produtos do tenant.
  // `produtos` usa `user_id` como dono (não `owner_id`) — ver carregarProdutosCatalogo/Contrato.
  const { data: prods } = await supabase.from("produtos").select("id, nome").eq("user_id", uid);
  const ids = (prods || []).map((p: any) => p.id);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("produto_conhecimento")
    .select("id, produto_id, tipo, titulo, conteudo, ordem, created_at")
    .in("produto_id", ids)
    .order("ordem", { ascending: true })
    .limit(300);
  if (error) { console.warn("[dados] produto_conhecimento:", error.message); return []; }
  const nomePor: Record<string, string> = {};
  for (const p of prods || []) nomePor[(p as any).id] = (p as any).nome;
  return (data || []).map((b: any) => ({
    id: b.id,
    produto_id: b.produto_id,
    produto_nome: nomePor[b.produto_id] || "—",
    tipo: b.tipo || "info",
    titulo: b.titulo || "Sem título",
    conteudo: b.conteudo || "",
    ordem: b.ordem || 0,
  }));
}

/* ============== PR-12: CANAL Z-API por tenant ============== */
async function carregarCanalZapi(uid: string) {
  const { data, error } = await supabase
    .from("canais")
    .select("id, type, is_active, zapi_instance_id, whatsapp_phone, url_foto_perfil, chip_connected_since, chip_maturity_tier, humanize_enabled, updated_at")
    .eq("user_id", uid)
    .eq("type", "whatsapp")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.warn("[dados] canais:", error.message); return null; }
  if (!data) return null;
  return {
    id: (data as any).id,
    ativo: (data as any).is_active !== false,
    instancia: (data as any).zapi_instance_id || "",
    telefone: (data as any).whatsapp_phone || "",
    foto: (data as any).url_foto_perfil || "",
    chip_desde: (data as any).chip_connected_since || null,
    chip_tier: (data as any).chip_maturity_tier || "novo",
    humanizar: (data as any).humanize_enabled !== false,
    atualizado: ((data as any).updated_at || "").slice(0, 16).replace("T", " "),
  };
}

/* ============== PR-12: AGENTE_USUARIO (identidade do agente do tenant) ============== */
async function carregarAgenteUsuario(uid: string) {
  const { data, error } = await supabase
    .from("agentes_usuario")
    .select("id, nome_agente, identidade, modelo_principal, temperatura, max_tokens, tom_agente, is_active, updated_at")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.warn("[dados] agentes_usuario:", error.message); return null; }
  if (!data) return null;
  const ident = (data as any).identidade || {};
  return {
    id: (data as any).id,
    nome: (data as any).nome_agente || ident.nome || "Agente",
    persona: ident.persona || ident.descricao || "",
    tom: (data as any).tom_agente || ident.tom || "amigável + profissional",
    genero: ident.genero || "feminino",
    modelo: (data as any).modelo_principal || "gemini-2.5-flash",
    temperatura: Number((data as any).temperatura || 0.7),
    max_tokens: Number((data as any).max_tokens || 1024),
    ativo: (data as any).is_active !== false,
    atualizado: ((data as any).updated_at || "").slice(0, 16).replace("T", " "),
  };
}

async function carregarEquipe(uid: string) {
  // Membros = profiles cujo parent_user_id = uid (subordinados do dono logado).
  // Inclui `avatar_url` pra renderizar a foto real do membro (não só iniciais).
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, page_permissions, is_active, created_at")
    .eq("parent_user_id", uid)
    .order("created_at", { ascending: false });
  if (error) { console.warn("[dados] equipe:", error.message); return []; }
  return (data || []).map((m: any) => ({
    id: m.id,
    nome: m.full_name || m.email || "Sem nome",
    email: m.email || "",
    foto_url: m.avatar_url || null,
    avatar: iniciais(m.full_name || m.email || "?"),
    cargo: "Membro",
    permissions: Array.isArray(m.page_permissions) ? m.page_permissions : [],
    ativo: m.is_active !== false,
  }));
}

async function carregarPlanoAtual(uid: string) {
  const { data } = await supabase
    .from("assinaturas_usuario")
    .select("*")
    .eq("user_id", uid)
    .eq("status", "ativa")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  // A tabela não guarda "dias até expirar" — é derivado de data_expiracao
  // (hoje até o vencimento). Antes lia uma coluna inexistente e caía em 30 fixo.
  const dataExp = (data as any).data_expiracao || "";
  const diasAteExpirar = dataExp
    ? Math.max(
        0,
        Math.ceil((new Date(dataExp).getTime() - Date.now()) / 86400000),
      )
    : 0;
  return {
    plano_nome: (data as any).plano_nome || "Pro",
    conversas_usadas: (data as any).conversas_usadas || 0,
    max_conversas: (data as any).max_conversas || 0,
    dias_ate_expirar: diasAteExpirar,
    data_expiracao: dataExp.slice(0, 10),
    status: (data as any).status || "ativa",
  };
}

/* ============== PR-05: LOJA / CONTRATOS / PRODUTOS ============== */

async function carregarPlanos(ehAdmin: boolean) {
  // Δ 2026-09-21: só o admin usa a lista (ModalCriarTenant). Tenant comum não baixa
  // os planos da Babel com preço (Carlos: "remove os planos da plataforma").
  if (!ehAdmin) return [];
  const { data, error } = await supabase
    .from("loja_planos")
    .select("id, nome, descricao, preco_mensal, max_conversas, max_ciclos_por_conversa, dias_expiracao, max_storage_mb, is_active")
    .eq("is_active", true)
    .order("preco_mensal", { ascending: true });
  if (error) { console.warn("[dados] planos:", error.message); return []; }
  return (data || []).map((p: any, i: number) => ({
    id: p.id,
    nome: p.nome,
    preco: Number(p.preco_mensal || 0),
    max_conversas: p.max_conversas || 0,
    ciclos: p.max_ciclos_por_conversa || 4,
    dias: p.dias_expiracao || 30,
    storage: Math.round(((p.max_storage_mb || 0) / 1024) * 10) / 10,
    popular: i === 1,
    beneficios: (p.descricao || "").split("\n").filter(Boolean),
  }));
}

async function carregarContratos(uid: string) {
  const data = await paginarTudo<any>(() => {
    const base = supabase
      .from("contratos")
      .select("id, titulo, status, created_at, assinado_em, dados_cliente, tenant_id, nome_template")
      .order("created_at", { ascending: false });
    // Ver comentário em carregarLeads: sem exceção pro lado admin.
    return base.eq("tenant_id", uid);
  }, { tamanho: 1000, maxPaginas: 5 });
  return (data || []).map((c: any) => ({
    id: c.id,
    cliente: (c.dados_cliente?.nome) || c.titulo || "—",
    valor: Number(c.dados_cliente?.valor || 0),
    status: c.status || "rascunho",
    criado: (c.created_at || "").slice(0, 10),
    vence: c.dados_cliente?.vence || null,
    template: c.nome_template || "Padrão",
  }));
}

async function carregarProdutosContrato(uid: string) {
  // Tabela `produtos` não tem coluna `preco` — preço de contrato vem dos itens (`contrato_itens.preco_unitario`).
  // Mantemos preco=0 no shape pra compat com consumidores que esperam {id, nome, preco}.
  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome")
    .eq("user_id", uid)
    .limit(50);
  if (error) { console.warn("[dados] produtosContrato:", error.message); return []; }
  return (data || []).map((p: any) => ({ id: p.id, nome: p.nome, preco: 0 }));
}

/* ============== PR-06: AGENTE / CONHECIMENTO ============== */

async function carregarCargos(uid: string, ehAdmin: boolean) {
  // Admin (plataforma) ve a tabela inteira; tenant comum usa a RPC que ja resolve
  // os 3 escopos (global nao substituido + nicho do tenant + tenant proprio) sem duplicar.
  if (ehAdmin) {
    const { data, error } = await supabase
      .from("cargos")
      .select("id, nome, tipologia, ordem, descricao, objetivo_principal, campos_rastreio, ativo, tenant_id, escopo")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    if (error) { console.warn("[dados] cargos:", error.message); return []; }
    return (data || []).map(mapearCargo);
  }
  // RPC ainda nao esta no Database type gerado; cast mantem assinatura segura no consumo.
  const sbBruto = supabase as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await sbBruto.rpc("cargos_visiveis_tenant");
  if (error) { console.warn("[dados] cargos rpc:", error.message); return []; }
  // RPC ja filtra por ativo + ordena por ordem; manter mapeamento identico.
  // Variavel uid passada por simetria de assinatura — RPC usa auth.uid() internamente.
  void uid;
  const linhas = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return linhas.map(mapearCargo);
}

function mapearCargo(c: Record<string, unknown>) {
  const tipologia = String(c.tipologia ?? "atendimento");
  return {
    id: String(c.id),
    nome: String(c.nome ?? ""),
    tipologia,
    ordem: Number(c.ordem ?? 0),
    bussola: String(c.objetivo_principal ?? c.descricao ?? ""),
    vira_coluna_kanban: tipologia === "face_cliente" || tipologia === "atendimento",
    rotulo_coluna: String(c.nome ?? ""),
    campos_rastreio: Array.isArray(c.campos_rastreio) ? c.campos_rastreio : [],
  };
}

async function carregarBlocos(uid: string, ehAdmin: boolean) {
  const q = supabase
    .from("blocos_conhecimento")
    .select("id, title, content, category, tags, ativo, escopo, agente_id")
    .order("created_at", { ascending: false })
    .limit(200);
  const { data, error } = ehAdmin ? await q : await q.or(`escopo.eq.global,escopo.eq.tenant`);
  if (error) { console.warn("[dados] blocos:", error.message); return []; }
  return (data || []).map((b: any) => ({
    id: b.id,
    title: b.title || "Sem título",
    category: b.category || "geral",
    ativo: b.ativo !== false,
    tags: b.tags || [],
    excerpt: (b.content || "").slice(0, 180),
  }));
}

/* ============== PR-07: ADMIN (Financeiro / Sócio) ============== */

async function carregarPedidos(ehAdmin: boolean) {
  if (!ehAdmin) return [];
  const { data, error } = await supabase
    .from("pedidos_compra")
    .select("id, user_id, tipo, item_nome, item_preco, status, created_at, profiles:user_id(full_name, email)")
    .eq("status", "aguardando")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { console.warn("[dados] pedidos:", error.message); return []; }
  return (data || []).map((p: any) => {
    const nome = p.profiles?.full_name || p.profiles?.email || "Tenant";
    return {
      id: p.id,
      tenant: nome,
      avatar: nome.split(" ").slice(0, 2).map((s: string) => s[0]?.toUpperCase() ?? "").join("") || "?",
      cor: "#7c5ce0",
      tipo: p.tipo || "plano",
      item: p.item_nome || "—",
      valor: Number(p.item_preco || 0),
      status: p.status,
      criado: (p.created_at || "").slice(0, 16).replace("T", " "),
    };
  });
}

async function carregarSaques(ehAdmin: boolean) {
  if (!ehAdmin) return [];
  const { data, error } = await supabase
    .from("multinivel_saques")
    .select("id, user_id, valor, chave_pix, metodo, status, created_at, profiles:user_id(full_name, email)")
    .eq("status", "pendente")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { console.warn("[dados] saques:", error.message); return []; }
  return (data || []).map((s: any) => {
    const nome = s.profiles?.full_name || s.profiles?.email || "Sócio";
    return {
      id: s.id,
      socio: nome,
      avatar: nome.split(" ").slice(0, 2).map((x: string) => x[0]?.toUpperCase() ?? "").join("") || "?",
      cor: "#e0a23a",
      valor: Number(s.valor || 0),
      chave: `${s.chave_pix || "—"} (${s.metodo || "PIX"})`,
      criado: (s.created_at || "").slice(0, 16).replace("T", " "),
    };
  });
}

async function carregarComissoes(ehAdmin: boolean) {
  if (!ehAdmin) return [];
  const { data, error } = await supabase
    .from("comissoes_indicacao_campanha")
    .select("*")
    .limit(50);
  if (error) return [];
  return (data || []).map((c: any) => ({
    id: c.id,
    nivel: c.nivel || 1,
    tipo_produto: c.tipo_produto || "mensalidade",
    tipo_valor: c.tipo_valor || "percentual",
    valor: Number(c.valor || 0),
    ativo: c.ativo !== false,
    descricao: c.descricao || "",
  }));
}

/* ============== PR-09: KPIs ADMIN agregados ============== */

async function carregarKpisAdmin(ehAdmin: boolean) {
  if (!ehAdmin) return null;
  const intervalos: Array<{ k: "7d" | "30d" | "90d" | "total"; dias: number | null; pts: number }> = [
    { k: "7d", dias: 7, pts: 7 },
    { k: "30d", dias: 30, pts: 30 },
    { k: "90d", dias: 90, pts: 12 },
    { k: "total", dias: null, pts: 24 },
  ];
  const [{ count: tenants }, { count: agentes }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("agentes").select("*", { count: "exact", head: true }).eq("is_active", true),
  ]);
  const out: Record<string, any> = {};
  for (const { k, dias, pts } of intervalos) {
    // count "estimated": mensagens passou de 290k linhas e o count exato sob
    // RLS estourava o statement timeout (500/57014 no console, 2026-08-21).
    // Pra KPI de dashboard a estimativa do planner é suficiente e instantânea.
    let qMsg = supabase.from("mensagens").select("*", { count: "estimated", head: true });
    if (dias) {
      const desde = new Date(Date.now() - dias * 86400000).toISOString();
      qMsg = qMsg.gte("created_at", desde);
    }
    const { count: msgs } = await qMsg;
    out[k] = {
      tenants: tenants || 0,
      agentes: agentes || 0,
      msgs: msgs || 0,
      custo: Math.round(((msgs || 0) * 0.0042) * 10) / 10, // estimativa: $0.0042/msg
      pts,
    };
  }
  return out;
}

/* ============== PR-11: TENANTS (admin) ============== */

async function carregarTenants(ehAdmin: boolean) {
  if (!ehAdmin) return [];
  // Tenants = donos de conta (parent_user_id IS NULL e system_role = 'user')
  const { data: profs, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, avatar_url, is_active, account_status, created_at, cargo, cnpj, tipo_pessoa, chave_pix, system_role, parent_user_id, deleted_at")
    .is("parent_user_id", null)
    .neq("system_role", "admin")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) { console.warn("[dados] tenants:", error.message); return []; }

  // Plano por tenant: pega a ÚLTIMA assinatura (ativa ou expirada) — usuários
  // com plano expirado precisam aparecer com o plano que tinham + badge "expirado".
  const ids = (profs || []).map((p: any) => p.id);
  const { data: ass } = ids.length
    ? await supabase
        .from("assinaturas_usuario")
        .select("user_id, plano_nome, plano_id, conversas_usadas, max_conversas, status, data_expiracao, created_at")
        .in("user_id", ids)
        .order("created_at", { ascending: false })
    : { data: [] as any[] };
  const planoPor: Record<string, any> = {};
  // Como ordenamos desc, a primeira ocorrência por user_id é a mais recente
  for (const a of ass || []) {
    const uid = (a as any).user_id;
    if (!planoPor[uid]) planoPor[uid] = a;
  }

  return (profs || []).map((p: any) => {
    const a = planoPor[p.id];
    // Excluído (soft delete via admin-excluir-tenant) vence os outros status:
    // some das abas normais e só aparece em "Excluídos", com opção de restaurar.
    const status = p.deleted_at ? "excluido" : p.is_active === false ? "inativo" : (p.account_status === "pending" ? "pendente" : "ativo");
    const planoExpirado = a && a.status !== "ativa";
    return {
      id: p.id,
      avatar: iniciais(p.full_name || p.email || "?"),
      avatar_url: p.avatar_url || null,
      nome: p.full_name || "Sem nome",
      email: p.email || "",
      phone: p.phone || "",
      cargo: p.cargo || "",
      cnpj: p.cnpj || "",
      tipo_pessoa: p.tipo_pessoa || "",
      chave_pix: p.chave_pix || "",
      account_status: p.account_status || "active",
      is_active: p.is_active !== false,
      status,
      plano: a?.plano_nome || "—",
      plano_id: a?.plano_id || null,
      plano_status: a?.status || null,
      plano_expirado: !!planoExpirado,
      conversas: a?.conversas_usadas || 0,
      max_conversas: a?.max_conversas || 0,
      data_expiracao: (a?.data_expiracao || "").slice(0, 10),
      created: (p.created_at || "").slice(0, 10),
      excluido_em: (p.deleted_at || "").slice(0, 10),
      tokens: 0,
    };
  });
}

async function carregarAplicativosCatalogo() {
  const { data, error } = await supabase
    .from("loja_aplicativos")
    .select("id, slug, nome, descricao, icone, categoria, preco_mensal, ordem, is_active")
    .eq("is_active", true)
    .order("ordem", { ascending: true });
  if (error) {
    console.warn("[dados] aplicativos catálogo:", error);
    return [];
  }
  return data || [];
}

async function carregarAplicativosInstalados(uid: string) {
  const { data, error } = await supabase
    .from("aplicativos_instalados")
    .select("aplicativo_slug")
    .eq("user_id", uid);
  if (error) {
    console.warn("[dados] aplicativos instalados:", error);
    return [];
  }
  return (data || []).map((r: any) => r.aplicativo_slug as string);
}

export function useDadosBundle(uid: string | null, ehAdmin: boolean) {
  const [pronto, setPronto] = useState(false);
  // Época da rodada de hidratação. Cada execução do effect captura uma época e
  // o cleanup a invalida (incrementa). Na transição user→admin (ou StrictMode),
  // duas rodadas correm em paralelo escrevendo no MESMO window.RAGENTIC_DATA: sem
  // guarda, a rodada "user" (antiga) podia sobrescrever a "admin" e vazar dados
  // do tenant errado. O guard descarta a escrita/evento da rodada obsoleta —
  // a rodada mais nova (época atual) é a única que grava. Diferente do antigo
  // `if (!vivo) return` (removido ~670-675): aquele abortava até a rodada válida
  // no re-render e prendia a UI no mock; a época deixa a rodada mais nova sempre
  // completar a escrita.
  const epocaRef = useRef(0);

  useEffect(() => {
    setPronto(false);
    if (!uid) return;

    const minhaEpoca = ++epocaRef.current;

    // BOOT IMEDIATO (2026-05-14): libera Desktop assim que sessão+role estão prontos.
    // Queries de dados rodam em background populando `window.RAGENTIC_DATA`. Apps
    // têm fallback pra dados vazios (mostram "Carregando…" próprio) e re-renderam
    // quando os dados chegam. Antes: bloqueava 1-15s aguardando 20 queries paralelas.
    setPronto(true);

    (async () => {
      try {
        // Promise.allSettled (não Promise.all): se UMA query rejeitar, as
        // outras 19 ainda hidratam — antes 1 falha derrubava tudo e a UI
        // ficava presa no mock pra sempre (evento de hidratação nem disparava).
        const NOMES_QUERY = [
          "leads", "equipe", "planoAtual", "planos", "contratos",
          "produtosContrato", "cargos", "blocos", "pedidos", "saques",
          "comissoes", "kpisAdmin", "tenants", "conversas", "clientes",
          "produtosCatalogo", "contratoTemplates", "conhecimentoProduto",
          "canalZapi", "agenteUsuario", "aplicativosCatalogo", "aplicativosInstalados",
        ];
        const settled = await Promise.allSettled([
          carregarLeads(uid),
          carregarEquipe(uid),
          carregarPlanoAtual(uid),
          carregarPlanos(ehAdmin),
          carregarContratos(uid),
          carregarProdutosContrato(uid),
          carregarCargos(uid, ehAdmin),
          carregarBlocos(uid, ehAdmin),
          carregarPedidos(ehAdmin),
          carregarSaques(ehAdmin),
          carregarComissoes(ehAdmin),
          carregarKpisAdmin(ehAdmin),
          carregarTenants(ehAdmin),
          carregarConversas(uid),
          carregarClientes(uid),
          carregarProdutosCatalogo(uid),
          carregarContratoTemplates(uid),
          carregarConhecimentoProduto(uid),
          carregarCanalZapi(uid),
          carregarAgenteUsuario(uid),
          carregarAplicativosCatalogo(),
          carregarAplicativosInstalados(uid),
        ]);
        // Se esta rodada já foi superada por outra (ex.: user→admin, ou
        // StrictMode), NÃO grava: a escrita obsoleta poderia sobrescrever a
        // hidratação da época atual com dados do tenant/role errado. A rodada
        // mais nova (época atual) é quem completa a escrita — então a UI ainda
        // sai do mock, sem o risco do antigo `if (!vivo) return` (que abortava
        // até a rodada válida).
        if (minhaEpoca !== epocaRef.current) return;
        // Loga qual query falhou (nome + índice) pra corrigir a fonte depois.
        settled.forEach((r, i) => {
          if (r.status === "rejected") {
            console.warn(
              `[dados] query "${NOMES_QUERY[i]}" (#${i}) falhou — segue com vazio:`,
              r.reason,
            );
          }
        });
        const valor = <T,>(i: number, fb: T): T =>
          settled[i].status === "fulfilled"
            ? (settled[i] as PromiseFulfilledResult<T>).value
            : fb;
        const leads = valor<any[]>(0, []);
        const equipe = valor<any[]>(1, []);
        const plano = valor<any>(2, null);
        const planos = valor<any[]>(3, []);
        const contratos = valor<any[]>(4, []);
        const produtosCont = valor<any[]>(5, []);
        const cargos = valor<any[]>(6, []);
        const blocos = valor<any[]>(7, []);
        const pedidos = valor<any[]>(8, []);
        const saques = valor<any[]>(9, []);
        const comissoes = valor<any[]>(10, []);
        const kpisAdmin = valor<any>(11, null);
        const tenants = valor<any[]>(12, []);
        const conversasBundle = valor<any>(13, null);
        const clientes = valor<any[]>(14, []);
        const produtosCatalogo = valor<any[]>(15, []);
        const contratoTemplates = valor<any[]>(16, []);
        const conhecimentoProduto = valor<any[]>(17, []);
        const canalZapi = valor<any>(18, null);
        const agenteUsuario = valor<any>(19, null);
        const aplicativosCatalogo = valor<any[]>(20, []);
        const aplicativosInstaladosSlugs = valor<string[]>(21, []);

        const W = (window as any).RAGENTIC_DATA || {};
        if (leads.length) {
          // Enriquecer leads com preview/delta da última mensagem (PR-12).
          const ult = conversasBundle?.ultimaPorLead || {};
          W.LEADS = leads.map((l: any) => {
            const u = ult[l.id];
            return u ? { ...l, preview: u.preview, delta: u.delta } : l;
          });
        }
        // Δ 2026-09-17 (varredura): antes cada lista só substituía o mock se viesse
        // NÃO VAZIA (`if (contratos.length) ...`). Tenant novo ou consulta que
        // falha (rede/RLS) deixava o mock de bundle.jsx na tela — "João Reis
        // R$ 2.400", "Ana Beatriz" — como se fossem clientes reais do usuário.
        // Agora o dado real SEMPRE substitui, mesmo vazio (era o que EQUIPE já
        // fazia), e a lista que falhou vira vazia, não fictícia.
        W.EQUIPE = equipe; // sempre o real (mesmo vazio) — nunca deixa o mock vazar
        W.PLANOS = planos;
        W.CONTRATOS = contratos;
        W.PRODUTOS_CONTRATO = produtosCont;
        W.CARGOS = cargos;
        W.BLOCOS = blocos;
        W.PEDIDOS = pedidos;
        W.SAQUES = saques;
        W.COMISSOES = comissoes;
        W.TENANTS = tenants;
        W.CONVERSAS = conversasBundle?.conversas ?? [];
        W.CLIENTES = clientes;
        W.PRODUTOS = produtosCatalogo;
        W.CONTRATO_TEMPLATES = contratoTemplates;
        W.PRODUTO_CONHECIMENTO = conhecimentoProduto;
        // Objetos únicos: mantêm o "só se vier" porque null quebraria consumidor
        // que espera objeto; o mock aqui é estrutura, não cliente fictício.
        if (plano) W.PLANO_ATUAL = plano;
        if (kpisAdmin) W.KPIS_ADMIN = kpisAdmin;
        if (canalZapi) W.CANAL_ZAPI = canalZapi;
        if (agenteUsuario) W.AGENTE_USUARIO = agenteUsuario;
        // Quantas consultas falharam nesta rodada (a UI pode avisar em vez de
        // mostrar lista vazia como se fosse "não tem nada").
        W.DADOS_FALHAS = settled.filter((r) => r.status === "rejected").length;
        // Aplicativos: catálogo + slugs instalados pelo user atual.
        // Bundle.jsx usa pra filtrar Launchpad/Spotlight/Dock — slug que está no
        // catálogo só aparece se está em APLICATIVOS_INSTALADOS_SLUGS. Apps core
        // (slug fora do catálogo) sempre aparecem.
        W.APLICATIVOS_CATALOGO = aplicativosCatalogo;
        W.APLICATIVOS_CATALOGO_SLUGS = aplicativosCatalogo.map((a: any) => a.slug);
        W.APLICATIVOS_INSTALADOS_SLUGS = aplicativosInstaladosSlugs;
        // Re-checa a época imediatamente antes de gravar/emitir: entre o guard
        // acima e aqui não há await, mas manter a checagem colada à escrita
        // deixa a invariante explícita — só a rodada atual publica.
        if (minhaEpoca !== epocaRef.current) return;
        (window as any).RAGENTIC_DATA = W;
        // Avisa o resto da UI que os dados reais chegaram — apps que escutam podem refetch
        try {
          window.dispatchEvent(new CustomEvent("ragentic-dados-hidratados"));
        } catch (_) { /* noop */ }
      } catch (erro) {
        console.error("[dados] erro durante hidrate em background", erro);
        try {
          const W = (window as any).RAGENTIC_DATA || {};
          W.DADOS_FALHAS = (W.DADOS_FALHAS ?? 0) + 1;
          (window as any).RAGENTIC_DATA = W;
        } catch (_) { /* noop */ }
      }
    })();

    // Invalida esta rodada ao recriar/desmontar o effect: a próxima rodada pega
    // época maior e vira a única autorizada a gravar em window.RAGENTIC_DATA.
    return () => { epocaRef.current++; };
  }, [uid, ehAdmin]);

  return { pronto };
}