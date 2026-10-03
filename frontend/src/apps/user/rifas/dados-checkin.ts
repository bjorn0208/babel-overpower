/**
 * Camada de dados — check-in de entrega do ritual bom-dia (Theus 2026-09-02).
 * `rifa_bom_dia_envios` ganhou status_saudacao/status_followup — este arquivo
 * só lê pro painel; quem grava é o cron-bom-dia-rifa.
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

export type StatusEnvio = "sucesso" | "erro" | null;

export interface CheckinContato {
  id: string;
  dia: string;
  nome: string | null;
  phone: string | null;
  statusSaudacao: StatusEnvio;
  erroSaudacao: string | null;
  statusFollowup: StatusEnvio;
  erroFollowup: string | null;
}

/** Dia corrente em BRT — mesmo cálculo do cron-bom-dia-rifa (pg_cron roda em UTC). */
function diaBRT(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

export async function listarCheckinHoje(): Promise<CheckinContato[]> {
  const sb = await sbCliente();
  const uid = await uidAtual(sb);
  if (!uid) return [];
  const { data, error } = await sb
    .from("rifa_bom_dia_envios")
    .select("id, dia, status_saudacao, erro_saudacao, status_followup, erro_followup, leads(name, nome_exibicao, phone)")
    .eq("tenant_id", uid)
    .eq("dia", diaBRT())
    .order("saudado_em", { ascending: false });
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    dia: r.dia,
    nome: r.leads?.nome_exibicao ?? r.leads?.name ?? null,
    phone: r.leads?.phone ?? null,
    statusSaudacao: r.status_saudacao,
    erroSaudacao: r.erro_saudacao,
    statusFollowup: r.status_followup,
    erroFollowup: r.erro_followup,
  }));
}
