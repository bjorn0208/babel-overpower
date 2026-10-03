/**
 * Camada de dados — Kanban de atendimento de Rifas (Theus 2026-09-02).
 * Fases draggable = `pedidos_rifa.status` de verdade (mesmo padrão do Kanban
 * de Campanha `Operacao.tsx`: arrastar muda o status real, sem tabela de
 * fase própria). Coluna "Conversando" é informativa — conversas do tenant
 * que ainda não geraram nenhum pedido.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bruto = any;

async function sbCliente(): Promise<Bruto> {
  return (
    (window as { supabaseClient?: Bruto }).supabaseClient ||
    (await import("@/integrations/supabase/client")).supabase
  );
}

async function uidAtual(sb: Bruto): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data?.session?.user?.id ?? null;
}

export type FaseKanban = "conversando" | "reservado" | "aguardando_validacao" | "pago";

export interface CardAtendimento {
  pedidoId: string | null;
  conversaId: string | null;
  leadId: string | null;
  rifaId: string | null;
  rifaTitulo: string | null;
  nome: string | null;
  phone: string | null;
  fotoUrl: string | null;
  numeros: number[];
  valorCentavos: number | null;
  fase: FaseKanban;
  atualizadoEm: string;
}

const CAMPOS_PEDIDO =
  "id, conversa_id, lead_id, rifa_id, nome, phone, numeros, valor_centavos, status, created_at, updated_at, " +
  "rifas(titulo), leads(name, nome_exibicao, url_foto_perfil, phone)";

/** Pedidos vivos (reservado/aguardando_validacao/pago) — viram os cards das 3 colunas draggable. */
export async function listarPedidosKanban(): Promise<CardAtendimento[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) return [];
  const { data, error } = await sb
    .from("pedidos_rifa")
    .select(CAMPOS_PEDIDO)
    .eq("tenant_id", uid)
    .in("status", ["reservado", "aguardando_validacao", "pago"])
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((p: any) => ({
    pedidoId: p.id,
    conversaId: p.conversa_id,
    leadId: p.lead_id,
    rifaId: p.rifa_id,
    rifaTitulo: p.rifas?.titulo ?? null,
    nome: p.leads?.nome_exibicao ?? p.leads?.name ?? p.nome ?? null,
    phone: p.leads?.phone ?? p.phone ?? null,
    fotoUrl: p.leads?.url_foto_perfil ?? null,
    numeros: p.numeros ?? [],
    valorCentavos: p.valor_centavos ?? null,
    fase: p.status as FaseKanban,
    atualizadoEm: p.updated_at ?? p.created_at,
  }));
}

/** Conversas ativas SEM pedido ainda — coluna "Conversando" (não-draggable). */
export async function listarConversandoSemPedido(idsComPedido: Set<string>): Promise<CardAtendimento[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) return [];
  const { data, error } = await sb
    .from("conversas")
    .select("id, lead_id, phone, updated_at, leads(name, nome_exibicao, url_foto_perfil, phone)")
    .eq("tenant_id", uid)
    .in("status", ["ativa", "humano"])
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? [])
    .filter((c: any) => !c.lead_id || !idsComPedido.has(c.lead_id))
    .map((c: any) => ({
      pedidoId: null,
      conversaId: c.id,
      leadId: c.lead_id,
      rifaId: null,
      rifaTitulo: null,
      nome: c.leads?.nome_exibicao ?? c.leads?.name ?? null,
      phone: c.leads?.phone ?? c.phone ?? null,
      fotoUrl: c.leads?.url_foto_perfil ?? null,
      numeros: [],
      valorCentavos: null,
      fase: "conversando" as FaseKanban,
      atualizadoEm: c.updated_at,
    }));
}

/** Arrastar um card entre as 3 colunas de pedido = mudar o status de verdade. */
export async function moverFasePedido(pedidoId: string, novaFase: Exclude<FaseKanban, "conversando">): Promise<void> {
  const sb = await sbCliente();
  const corpo: Record<string, unknown> = { status: novaFase, updated_at: new Date().toISOString() };
  if (novaFase === "pago") corpo.pago_em = new Date().toISOString();
  const { error } = await sb.from("pedidos_rifa").update(corpo).eq("id", pedidoId);
  if (error) throw error;
}
