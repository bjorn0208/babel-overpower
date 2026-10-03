/**
 * Lógica pura da página pública de acompanhamento do cliente.
 * Portado do frontend antigo (`use-acompanhamento-publico.ts`, já enxuto) e
 * isolado aqui pra ser testável sem Supabase. Onda 2026-05-16 (pedaço 2/3).
 */

export type FluxoCheckpoint = { id: string; label: string };
export type FluxoStage = { id: string; label: string; color: string; checkpoints: FluxoCheckpoint[] };
export type FluxoProduto = {
  produto: string;
  stages: FluxoStage[];
  timer_attention_days?: number;
  timer_late_days?: number;
};

/** RPC pode devolver array JSON ou um único objeto de fluxo. */
export function normalizarListaFluxosPublico(raw: unknown): FluxoProduto[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as FluxoProduto[];
  if (
    typeof raw === "object" &&
    raw !== null &&
    "stages" in (raw as object) &&
    Array.isArray((raw as FluxoProduto).stages)
  ) {
    return [raw as FluxoProduto];
  }
  return [];
}

/** Escolhe o fluxo cujo produto casa (igual/contém) com o produto do lead. */
export function escolherFluxoParaLead(
  flows: FluxoProduto[],
  produtoLead: string | null | undefined,
): FluxoProduto | null {
  if (flows.length === 0) return null;
  const lp = (produtoLead || "").toLowerCase();
  if (!lp) return flows[0] ?? null;
  const match = flows.find((f) => {
    const fp = (f.produto ?? "").toLowerCase();
    if (!fp) return false;
    return fp === lp || fp.includes(lp) || lp.includes(fp);
  });
  return match ?? flows[0] ?? null;
}

export interface ResultadoTimer {
  days: number | null;
  isLate: boolean;
  isAttention: boolean;
  timerColor: string;
  timerLabel: string;
}

/** Dias desde a conversão + faixa de cor/label (no prazo / atenção / atrasado). */
export function calcularTimer(
  convertedAt: string | null | undefined,
  attDays: number,
  lateDays: number,
): ResultadoTimer {
  const days = convertedAt
    ? Math.floor((Date.now() - new Date(convertedAt).getTime()) / 86_400_000)
    : null;
  const isLate = days !== null && days >= lateDays;
  const isAttention = days !== null && days >= attDays;
  const timerColor = isLate ? "#ef4444" : isAttention ? "#f59e0b" : "#10b981";
  const timerLabel = isLate ? "Atrasado" : isAttention ? "Atenção" : "No prazo";
  return { days, isLate, isAttention, timerColor, timerLabel };
}

export interface ResultadoProgresso {
  totalCps: number;
  doneCps: number;
  progressPct: number;
}

/** Conta checkpoints concluídos / total do fluxo → porcentagem. */
export function calcularProgresso(
  flow: FluxoProduto | null,
  checkpoints: Record<string, boolean>,
): ResultadoProgresso {
  const totalCps = flow?.stages.reduce((acc, s) => acc + s.checkpoints.length, 0) ?? 0;
  const doneCps =
    flow?.stages.reduce(
      (acc, s) => acc + s.checkpoints.filter((cp) => checkpoints[cp.id]).length,
      0,
    ) ?? 0;
  const progressPct = totalCps > 0 ? Math.round((doneCps / totalCps) * 100) : 0;
  return { totalCps, doneCps, progressPct };
}
