/**
 * Camada de dados — dossiê do cliente no Kanban de atendimento (Theus
 * 2026-09-02). "Livro da vida": todo pedido (em qualquer rifa) + vitórias +
 * números fixos + comprovantes desse lead/telefone no tenant.
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

export interface PedidoDossie {
  id: string;
  rifaId: string;
  rifaTitulo: string;
  rifaStatus: string;
  rifaCodigo: string | null;
  numeroSorteado: number | null;
  ganhadorPhone: string | null;
  nome: string;
  numeros: number[];
  valorCentavos: number;
  status: string;
  comprovanteUrl: string | null;
  criadoEm: string;
  pagoEm: string | null;
}

export interface NumeroFixoDossie {
  metodoSorteio: string;
  numero: number;
}

export interface Dossie {
  lead: { nome: string | null; fotoUrl: string | null; phone: string | null } | null;
  pedidos: PedidoDossie[];
  numerosFixos: NumeroFixoDossie[];
}

/** Telefone normalizado só pros dígitos — pra casar pedidos_rifa.phone quando não há lead_id. */
function soDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export async function buscarDossie(leadId: string | null, phone: string | null): Promise<Dossie> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid || (!leadId && !phone)) return { lead: null, pedidos: [], numerosFixos: [] };

  let leadRow: { name: string | null; nome_exibicao: string | null; url_foto_perfil: string | null; phone: string | null } | null = null;
  if (leadId) {
    const { data } = await sb
      .from("leads")
      .select("name, nome_exibicao, url_foto_perfil, phone")
      .eq("id", leadId)
      .maybeSingle();
    leadRow = data ?? null;
  }
  const foneAlvo = soDigitos(leadRow?.phone ?? phone);

  let query = sb
    .from("pedidos_rifa")
    .select(
      "id, rifa_id, nome, numeros, valor_centavos, status, comprovante_url, created_at, pago_em, " +
      "rifas(titulo, status, codigo_controle, numero_sorteado, ganhador_phone)",
    )
    .eq("tenant_id", uid)
    .order("created_at", { ascending: false });
  query = leadId ? query.eq("lead_id", leadId) : query.eq("phone", phone ?? "");
  const { data: pedidosRaw, error: erroPedidos } = await query;
  if (erroPedidos) throw erroPedidos;

  // deno-lint-ignore no-explicit-any
  const pedidos: PedidoDossie[] = (pedidosRaw ?? []).map((p: any) => ({
    id: p.id,
    rifaId: p.rifa_id,
    rifaTitulo: p.rifas?.titulo ?? "Rifa",
    rifaStatus: p.rifas?.status ?? "",
    rifaCodigo: p.rifas?.codigo_controle ?? null,
    numeroSorteado: p.rifas?.numero_sorteado ?? null,
    ganhadorPhone: p.rifas?.ganhador_phone ?? null,
    nome: p.nome,
    numeros: p.numeros ?? [],
    valorCentavos: p.valor_centavos,
    status: p.status,
    comprovanteUrl: p.comprovante_url,
    criadoEm: p.created_at,
    pagoEm: p.pago_em,
  }));

  let numerosFixos: NumeroFixoDossie[] = [];
  if (foneAlvo) {
    const { data: fixos } = await sb
      .from("rifa_numeros_fixos")
      .select("metodo_sorteio, numero, phone")
      .eq("tenant_id", uid);
    // deno-lint-ignore no-explicit-any
    numerosFixos = (fixos ?? [])
      .filter((f: any) => soDigitos(f.phone) === foneAlvo)
      // deno-lint-ignore no-explicit-any
      .map((f: any) => ({ metodoSorteio: f.metodo_sorteio, numero: f.numero }));
  }

  return {
    lead: leadRow ? { nome: leadRow.nome_exibicao ?? leadRow.name, fotoUrl: leadRow.url_foto_perfil, phone: leadRow.phone } : (phone ? { nome: null, fotoUrl: null, phone } : null),
    pedidos,
    numerosFixos,
  };
}

/** Vitória: número sorteado da rifa bate com algum número comprado deste pedido. */
export function ganhouEssePedido(p: PedidoDossie): boolean {
  return p.numeroSorteado !== null && p.numeros.includes(p.numeroSorteado);
}
