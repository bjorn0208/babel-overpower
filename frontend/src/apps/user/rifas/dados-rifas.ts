/**
 * Camada de dados do app Rifas — fala com o banco real:
 * tabelas `rifas` / `pedidos_rifa` / `rifas_config_tenant` (RLS por tenant)
 * e RPCs `obter_rifa_por_token` · `confirmar_pagamento_pedido_rifa` ·
 * `sortear_rifa` · `reservar_numeros_rifa_publico` (venda manual).
 */

import type { CargaRifa, ConfigRifas, DetalheRifa, PedidoRifa, Rifa, StatusPedidoRifa, StatusRifa } from "./tipos";

// Tabelas de rifa ainda não estão no schema tipado gerado do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bruto = any;

declare global {
  interface Window {
    supabaseClient?: Bruto;
  }
}

async function sbCliente(): Promise<Bruto> {
  return window.supabaseClient || (await import("@/integrations/supabase/client")).supabase;
}

/**
 * Δ 2026-09-17: devolvia o uid do LOGADO e isso virava `tenant_id` de tudo no
 * app Rifas (inclusive nos inserts) — membro de equipe via rifa nenhuma e criava
 * rifa invisível pro dono. Agora resolve o dono da conta (`parent_user_id`).
 * Mantém o nome pra não mexer nas ~20 chamadas.
 */
async function uidAtual(sb: Bruto): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  const uid = data?.session?.user?.id ?? null;
  if (!uid) return null;
  const { data: perfil, error } = await sb
    .from("profiles").select("parent_user_id").eq("id", uid).maybeSingle();
  if (error) {
    console.error("[rifas] não consegui resolver o dono da conta:", error);
    return null;
  }
  return (perfil?.parent_user_id as string | null) ?? uid;
}

export async function listarRifas(): Promise<Rifa[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const { data, error } = await sb
    .from("rifas")
    .select("*")
    .eq("tenant_id", uid)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Rifa[];
}

const STATUS_ATIVO: StatusPedidoRifa[] = ["reservado", "aguardando_validacao"];
const STATUS_CONCLUIDO: StatusPedidoRifa[] = ["pago", "rejeitado", "expirado", "cancelado"];
const JANELA_GRACA_HORAS = 24;

/** Coluna GERADA no banco (`concluido_em generated always as (coalesce(pago_em,
 * updated_at)) stored`) — precisa ser coluna de verdade pro PostgREST filtrar
 * (`.gt()`/`.lte()` não aceitam expressão SQL arbitrária, só nome de coluna).
 * Confirmado: `confirmar_pagamento_pedido_rifa` e `expirar_reservas_rifa`
 * sempre setam `updated_at = now()` na transição, então reflete de verdade
 * "quando concluiu". */

/** Aba "Todos" de Pedidos: pedidos em andamento (sempre) + concluídos há
 * menos de `JANELA_GRACA_HORAS` — pra não crescer sem limite (era `listarPedidos()`
 * sem filtro nenhum, carregando até 30 mil linhas no client). */
export async function listarPedidosAtivos(rifaId?: string): Promise<PedidoRifa[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const corte = new Date(Date.now() - JANELA_GRACA_HORAS * 3600_000).toISOString();
  let query = sb
    .from("pedidos_rifa")
    .select("*")
    .eq("tenant_id", uid)
    .or(`status.in.(${STATUS_ATIVO.join(",")}),and(status.in.(${STATUS_CONCLUIDO.join(",")}),concluido_em.gt.${corte})`)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (rifaId) query = query.eq("rifa_id", rifaId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PedidoRifa[];
}

/** Aba "Histórico": pedidos concluídos há mais de 24h, filtrado por período
 * (1/3/7/30 dias), paginado de verdade (índice `pedidos_rifa_concluido_em_idx`). */
export async function listarPedidosHistorico(dias: 1 | 3 | 7 | 30, rifaId?: string): Promise<PedidoRifa[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const corteGraca = new Date(Date.now() - JANELA_GRACA_HORAS * 3600_000).toISOString();
  const corteJanela = new Date(Date.now() - dias * 24 * 3600_000).toISOString();
  const todos: PedidoRifa[] = [];
  for (let pagina = 0; pagina < 30; pagina++) {
    const de = pagina * 1000;
    let query = sb
      .from("pedidos_rifa")
      .select("*")
      .eq("tenant_id", uid)
      .in("status", STATUS_CONCLUIDO)
      .lte("concluido_em", corteGraca)
      .gt("concluido_em", corteJanela)
      .order("created_at", { ascending: false })
      .range(de, de + 999);
    if (rifaId) query = query.eq("rifa_id", rifaId);
    const { data, error } = await query;
    if (error) throw error;
    const linhas = (data ?? []) as PedidoRifa[];
    todos.push(...linhas);
    if (linhas.length < 1000) break;
  }
  return todos;
}

export async function listarPedidos(): Promise<PedidoRifa[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  // Pagina em janelas de 1000 (limite duro do PostgREST) e propaga erro (o
  // hook useRifas conta com o throw pro vigia/retry): as stats por rifa têm
  // que somar TODOS os pedidos do tenant, não só os 500 mais recentes.
  const todos: PedidoRifa[] = [];
  for (let pagina = 0; pagina < 30; pagina++) {
    const de = pagina * 1000;
    const { data, error } = await sb
      .from("pedidos_rifa")
      .select("*")
      .eq("tenant_id", uid)
      .order("created_at", { ascending: false })
      .range(de, de + 999);
    if (error) throw error;
    const linhas = (data ?? []) as PedidoRifa[];
    todos.push(...linhas);
    if (linhas.length < 1000) break;
  }
  return todos;
}

export async function criarRifa(carga: CargaRifa): Promise<Rifa> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const { data, error } = await sb
    .from("rifas")
    .insert({ ...carga, tenant_id: uid, status: "rascunho" })
    .select()
    .single();
  if (error) throw error;
  return data as Rifa;
}

export async function atualizarRifa(id: string, carga: Partial<CargaRifa>): Promise<void> {
  const sb = await sbCliente();
  const { error } = await sb
    .from("rifas")
    .update({ ...carga, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function mudarStatusRifa(id: string, status: StatusRifa): Promise<void> {
  const sb = await sbCliente();
  const { error } = await sb
    .from("rifas")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Soft delete — números/pedidos ficam no histórico, rifa some das listas. */
export async function excluirRifa(id: string): Promise<void> {
  const sb = await sbCliente();
  const { error } = await sb
    .from("rifas")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Vitrine completa (progresso, ranking, cotas, números ocupados ≤1000). */
export async function obterDetalhe(chavePublica: string): Promise<DetalheRifa | null> {
  const sb = await sbCliente();
  const { data, error } = await sb.rpc("obter_rifa_por_token", { p_token: chavePublica });
  if (error || !data?.ok) return null;
  return data as DetalheRifa;
}

export interface ResultadoDecisao {
  ok: boolean;
  erro?: string;
  cotasPremiadasGanhas: Array<{ numero: number; premio: string }>;
}

export async function decidirPedido(
  pedidoId: string,
  aprovar: boolean,
  motivo: string | null,
): Promise<ResultadoDecisao> {
  const sb = await sbCliente();
  const { data, error } = await sb.rpc("confirmar_pagamento_pedido_rifa", {
    p_pedido: pedidoId,
    p_aprovar: aprovar,
    p_motivo: motivo,
  });
  if (error) return { ok: false, erro: String(error.message ?? error), cotasPremiadasGanhas: [] };
  if (!data?.ok) return { ok: false, erro: String(data?.erro ?? "recusado"), cotasPremiadasGanhas: [] };
  return { ok: true, cotasPremiadasGanhas: data.cotas_premiadas_ganhas ?? [] };
}

/** Reserva que passou do prazo de pagamento (1h antes do sorteio) sem pagar: o dono decide
 *  (Fabrício 10/09). `divida` lança os números em Dívidas; `sem_divida` deixa sem cobrança e o
 *  sorteio não gera dívida dela. Nos dois casos o número continua no nome da pessoa. */
export async function decidirReservaVencida(
  pedidoId: string,
  decisao: "divida" | "sem_divida",
): Promise<{ ok: boolean; erro?: string }> {
  const sb = await sbCliente();
  const { data, error } = await sb.rpc("rifa_decidir_reserva_vencida", {
    p_pedido: pedidoId,
    p_decisao: decisao,
  });
  if (error) return { ok: false, erro: String(error.message ?? error) };
  if (!data?.ok) return { ok: false, erro: String(data?.erro ?? "recusado") };
  return { ok: true };
}

/** Desistência com reembolso (Fabrício 10/09): desfaz pedido PAGO — inteiro (`numeros` null) ou só
 *  alguns números. Os números voltam a ficar disponíveis; o PIX o dono devolve por fora. */
export async function reembolsarPedido(
  pedidoId: string,
  numeros: number[] | null,
  motivo: string | null,
): Promise<{ ok: boolean; erro?: string; status?: string; reembolsoCentavos?: number; numerosLiberados?: number[] }> {
  const sb = await sbCliente();
  const { data, error } = await sb.rpc("rifa_reembolsar_pedido", {
    p_pedido: pedidoId,
    p_numeros: numeros,
    p_motivo: motivo,
  });
  if (error) return { ok: false, erro: String(error.message ?? error) };
  if (!data?.ok) return { ok: false, erro: String(data?.erro ?? "recusado") };
  return {
    ok: true,
    status: String(data.status ?? ""),
    reembolsoCentavos: Number(data.reembolso_centavos ?? 0),
    numerosLiberados: Array.isArray(data.numeros_liberados) ? data.numeros_liberados.map(Number) : [],
  };
}

export interface ResultadoSorteio {
  ok: boolean;
  erro?: string;
  numeroSorteado?: number;
  ganhadorNome?: string | null;
  semGanhador?: boolean;
}

export async function sortear(rifaId: string, numeroManual: number | null, numerosManuais?: number[]): Promise<ResultadoSorteio> {
  const sb = await sbCliente();
  const { data, error } = await sb.rpc("sortear_rifa", numerosManuais && numerosManuais.length > 1
    ? { p_rifa: rifaId, p_numeros_manuais: numerosManuais }
    : { p_rifa: rifaId, p_numero_manual: numeroManual });
  if (error) return { ok: false, erro: String(error.message ?? error) };
  if (!data?.ok) return { ok: false, erro: String(data?.erro ?? "sorteio recusado") };
  return {
    ok: true,
    numeroSorteado: data.numero_sorteado,
    ganhadorNome: data.ganhador_nome ?? null,
    semGanhador: Boolean(data.sem_ganhador),
  };
}

export interface ResultadoVendaManual {
  ok: boolean;
  erro?: string;
  pedidoToken?: string;
  numeros?: number[];
  valorCentavos?: number;
  chavePix?: string | null;
  expiraEm?: string;
}

const traduzirErroReserva = (m: string): string => {
  if (m.includes("NUMEROS_OCUPADOS")) return `Números já ocupados: ${m.split(":")[1] ?? ""}. Escolha outros.`;
  if (m.includes("NUMEROS_INSUFICIENTES")) return "Não há números livres suficientes.";
  if (m.includes("rate limit")) return "Muitas tentativas com esse phone. Aguarde alguns minutos.";
  return `Não foi possível reservar agora: ${m}`;
};

const montarVenda = (data: Bruto, numerosPedidos: number[]): ResultadoVendaManual => ({
  ok: true,
  pedidoToken: String(data.pedido_token),
  numeros: data.numeros ?? numerosPedidos,
  valorCentavos: Number(data.valor_centavos ?? 0),
  chavePix: data.chave_pix ?? null,
  expiraEm: data.expira_em,
});

/** Venda manual do dono: mesma RPC do link público/agente, origem 'manual' (tudo-ou-nada). */
export async function venderManual(
  chaveRifa: string,
  nome: string,
  phone: string,
  numeros: number[],
): Promise<ResultadoVendaManual> {
  const sb = await sbCliente();
  const { data, error } = await sb.rpc("reservar_numeros_rifa_publico", {
    p_token: chaveRifa,
    p_nome: nome,
    p_phone: phone,
    p_qtd: numeros.length,
    p_numeros: numeros,
    p_origem: "manual",
  });
  if (error) return { ok: false, erro: traduzirErroReserva(String(error.message ?? "")) };
  if (!data?.ok) return { ok: false, erro: String(data?.erro ?? "reserva recusada") };
  return montarVenda(data, numeros);
}

/** Venda manual por quantidade — a RPC sorteia números livres (rifa >1000 números). */
export async function venderManualPorQuantidade(
  chaveRifa: string,
  nome: string,
  phone: string,
  qtd: number,
): Promise<ResultadoVendaManual> {
  const sb = await sbCliente();
  const { data, error } = await sb.rpc("reservar_numeros_rifa_publico", {
    p_token: chaveRifa,
    p_nome: nome,
    p_phone: phone,
    p_qtd: qtd,
    p_numeros: null,
    p_origem: "manual",
  });
  if (error) return { ok: false, erro: traduzirErroReserva(String(error.message ?? "")) };
  if (!data?.ok) return { ok: false, erro: String(data?.erro ?? "reserva recusada") };
  return montarVenda(data, []);
}

export async function carregarConfig(): Promise<ConfigRifas & { pixDoPerfil: string | null }> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const [{ data: cfg }, { data: perfil }] = await Promise.all([
    sb.from("rifas_config_tenant").select("*").eq("tenant_id", uid).maybeSingle(),
    sb.from("profiles").select("chave_pix").eq("id", uid).maybeSingle(),
  ]);
  return {
    agente_pode_vender: cfg ? cfg.agente_pode_vender !== false : true,
    chave_pix: cfg?.chave_pix ?? null,
    postar_status_ativo: cfg?.postar_status_ativo === true,
    bom_dia_rifa_ativo: cfg?.bom_dia_rifa_ativo === true,
    bom_dia_mensagem_saudacao: cfg?.bom_dia_mensagem_saudacao ?? null,
    bom_dia_mensagem_followup: cfg?.bom_dia_mensagem_followup ?? null,
    bom_dia_midia_saudacao_url: cfg?.bom_dia_midia_saudacao_url ?? null,
    bom_dia_midia_followup_url: cfg?.bom_dia_midia_followup_url ?? null,
    ultimoPostStatusEm: cfg?.status_ultimo_post_em ?? null,
    pixDoPerfil: perfil?.chave_pix ?? null,
  };
}

export async function salvarConfig(cfg: ConfigRifas): Promise<void> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const { error } = await sb.from("rifas_config_tenant").upsert({
    tenant_id: uid,
    agente_pode_vender: cfg.agente_pode_vender,
    chave_pix: cfg.chave_pix?.trim() || null,
    postar_status_ativo: cfg.postar_status_ativo,
    bom_dia_rifa_ativo: cfg.bom_dia_rifa_ativo,
    bom_dia_mensagem_saudacao: cfg.bom_dia_mensagem_saudacao?.trim() || null,
    bom_dia_mensagem_followup: cfg.bom_dia_mensagem_followup?.trim() || null,
    bom_dia_midia_saudacao_url: cfg.bom_dia_midia_saudacao_url,
    bom_dia_midia_followup_url: cfg.bom_dia_midia_followup_url,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Sobe mídia (imagem/vídeo) do bom-dia pro bucket já usado nos anexos de rifa. */
export async function subirMidiaBomDia(arquivo: File): Promise<string> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const ext = arquivo.name.split(".").pop() || "bin";
  const caminho = `${uid}/bom-dia/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from("rifas-anexos").upload(caminho, arquivo, { upsert: true });
  if (error) throw error;
  const { data: pub } = sb.storage.from("rifas-anexos").getPublicUrl(caminho);
  return pub?.publicUrl ?? "";
}

/** Sobe imagem do prêmio pro bucket público e devolve a URL. */
export async function subirImagemPremio(arquivo: File): Promise<string> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const ext = arquivo.name.split(".").pop() || "jpg";
  const caminho = `${uid}/premios/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from("rifas-anexos").upload(caminho, arquivo, { upsert: true });
  if (error) throw error;
  const { data: pub } = sb.storage.from("rifas-anexos").getPublicUrl(caminho);
  return pub?.publicUrl ?? "";
}

/** Sobe a imagem que o dono manda no chat de teste (ex.: print de comprovante) e devolve a URL
 *  pública — o motor precisa baixar pra ler o conteúdo. */
export async function subirImagemChatTeste(arquivo: File): Promise<string> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const ext = arquivo.name.split(".").pop() || "jpg";
  const caminho = `${uid}/chat-teste/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from("rifas-anexos").upload(caminho, arquivo, { upsert: false, contentType: arquivo.type });
  if (error) throw error;
  const { data: pub } = sb.storage.from("rifas-anexos").getPublicUrl(caminho);
  return pub?.publicUrl ?? "";
}

/** Tempo real: qualquer mudança em rifas/pedidos_rifa dispara o callback. Devolve o cleanup. */
export async function assinarMudancas(aoMudar: () => void): Promise<() => void> {
  const sb = await sbCliente();
  const canal = sb
    .channel("app-rifas-tenant")
    .on("postgres_changes", { event: "*", schema: "public", table: "rifas" }, aoMudar)
    .on("postgres_changes", { event: "*", schema: "public", table: "pedidos_rifa" }, aoMudar)
    .subscribe();
  return () => {
    sb.removeChannel(canal);
  };
}

/** Status de cada número ocupado da rifa (reservado/aguardando_validacao/pago) —
 *  pra colorir a grade de venda com o funil real, não só "ocupado/livre"
 *  (pedido Theus 2026-09-01). Tenant-scoped (RLS), direto nas tabelas —
 *  substitui o `numeros_ocupados` flat da RPC pública `obter_rifa_por_token`
 *  quando quem olha é o dono. Número sem entrada aqui = disponível. */
export async function obterStatusNumeros(rifaId: string): Promise<Record<number, StatusPedidoRifa>> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const { data, error } = await sb
    .from("pedidos_rifa")
    .select("numeros, status")
    .eq("rifa_id", rifaId)
    .eq("tenant_id", uid)
    .in("status", ["reservado", "aguardando_validacao", "pago"]);
  if (error) throw error;
  const mapa: Record<number, StatusPedidoRifa> = {};
  for (const pedido of (data ?? []) as Array<{ numeros: number[]; status: StatusPedidoRifa }>) {
    for (const n of pedido.numeros ?? []) mapa[n] = pedido.status;
  }
  return mapa;
}

// ============================================================
// Números fixos (por tipo de sorteio) e dívidas — Fabrício 24-25/08/2026.
// Tabelas `rifa_numeros_fixos` / `rifa_dividas` + RPC
// `sincronizar_numeros_fixos_rifa` (reserva/libera fixos numa rifa ativa).
// ============================================================

export async function listarNumerosFixos(metodo: string): Promise<import("./tipos").NumeroFixoRifa[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const { data, error } = await sb
    .from("rifa_numeros_fixos")
    .select("*")
    .eq("tenant_id", uid)
    .eq("metodo_sorteio", metodo)
    .order("numero", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function adicionarNumeroFixo(metodo: string, numero: number, nome: string, phone: string | null): Promise<void> {
  await adicionarNumerosFixos(metodo, [numero], nome, phone);
}

/** Vários números pro MESMO contato de uma vez ("7, 13, 22" — Dominic 26/08).
 *  Duplicados são ignorados em silêncio (unique tenant+tipo+numero). */
export async function adicionarNumerosFixos(metodo: string, numeros: number[], nome: string, phone: string | null): Promise<void> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const linhas = [...new Set(numeros)].map((numero) => ({
    tenant_id: uid,
    metodo_sorteio: metodo,
    numero,
    nome,
    phone: phone || null,
    status: "ativo",
  }));
  const { error } = await sb
    .from("rifa_numeros_fixos")
    .upsert(linhas, { onConflict: "tenant_id,metodo_sorteio,numero", ignoreDuplicates: true });
  if (error) throw error;
}

/** Aprova o pedido de número fixo que veio do cliente pela conversa (status pendente → ativo).
 *  Quem chama ainda precisa sincronizar as rifas ativas pra reserva sair na rifa que está rolando. */
export async function aprovarNumeroFixo(id: string): Promise<void> {
  const sb = await sbCliente();
  const { error } = await sb.from("rifa_numeros_fixos").update({ status: "ativo" }).eq("id", id);
  if (error) throw error;
}

export async function removerNumeroFixo(id: string): Promise<void> {
  const sb = await sbCliente();
  const { error } = await sb.from("rifa_numeros_fixos").delete().eq("id", id);
  if (error) throw error;
}

export interface PedidoFixoNovo {
  nome: string;
  phone: string | null;
  numeros: number[];
  pedido_chave_publica: string;
}

export interface SincronizacaoFixos {
  ok: boolean;
  reservados?: number;
  liberados?: number;
  cancelados?: number;
  rifa_chave_publica?: string;
  pedidos_novos?: PedidoFixoNovo[];
}

/** Aplica os fixos numa rifa ATIVA (reserva os que faltam, libera os desfixados não pagos).
 *  Devolve os pedidos NOVOS criados (com o link de acompanhamento de cada um). */
export async function sincronizarFixosNaRifa(rifaId: string): Promise<SincronizacaoFixos> {
  const sb = await sbCliente();
  const { data, error } = await sb.rpc("sincronizar_numeros_fixos_rifa", { p_rifa: rifaId });
  if (error) throw error;
  return (data ?? { ok: false }) as SincronizacaoFixos;
}

/** Rifas ativas de um tipo de sorteio (pra sincronizar fixos após mudança). */
export async function rifasAtivasDoTipo(metodo: string): Promise<string[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const { data, error } = await sb
    .from("rifas")
    .select("id")
    .eq("tenant_id", uid)
    .eq("metodo_sorteio", metodo)
    .eq("status", "ativa")
    .is("deleted_at", null);
  if (error) throw error;
  return (data ?? []).map((r: { id: string }) => r.id);
}

export async function listarDividas(): Promise<import("./tipos").DividaRifa[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  const { data, error } = await sb
    .from("rifa_dividas")
    .select("*")
    .eq("tenant_id", uid)
    .order("sorteio_em", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data ?? [];
}

/** Editar o valor da dívida de uma pessoa (pedido do Fabrício). */
export async function atualizarDivida(id: string, patch: { valor_centavos?: number; pago?: boolean }): Promise<void> {
  const sb = await sbCliente();
  const { error } = await sb.from("rifa_dividas").update(patch).eq("id", id);
  if (error) throw error;
}

export async function excluirDivida(id: string): Promise<void> {
  const sb = await sbCliente();
  const { error } = await sb.from("rifa_dividas").delete().eq("id", id);
  if (error) throw error;
}
