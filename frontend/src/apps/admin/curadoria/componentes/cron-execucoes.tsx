// @ts-nocheck
/**
 * cron-execucoes.tsx — helpers visuais para a aba Crons.
 * Extraído de AbaCrons.tsx (Onda 9).
 *
 * Exporta:
 *  - badgeCategoria     (badge colorido por categoria)
 *  - badgeStatusExec    (badge ok/falha)
 *  - formatarUltimaExec (texto relativo "Xmin atrás")
 *  - HeatmapExecucoes   (grid 7d × 24h com saúde do job)
 */

import type { JobCron } from "../dados/tipos";

// ─── badges ───────────────────────────────────────────────────────────────────

export function badgeCategoria(cat: string) {
  const mapa: Record<string, { bg: string; cor: string }> = {
    rag:        { bg: "oklch(0.55 0.14 300 / 0.12)", cor: "oklch(0.65 0.18 300)" },
    motor:      { bg: "oklch(0.55 0.14 250 / 0.12)", cor: "oklch(0.55 0.14 250)" },
    campanha:   { bg: "oklch(0.72 0.18 145 / 0.12)", cor: "oklch(0.72 0.18 145)" },
    memoria:    { bg: "oklch(0.70 0.16 85 / 0.12)",  cor: "oklch(0.70 0.16 85)" },
    manutencao: { bg: "oklch(0.65 0.20 25 / 0.12)",  cor: "oklch(0.65 0.20 25)" },
    financeiro: { bg: "var(--os-acento-1-soft)",      cor: "var(--os-acento-1)" },
  };
  const s = mapa[cat] ?? { bg: "var(--os-painel2)", cor: "var(--os-txt3)" };
  return (
    <span
      className="badge tiny mono"
      style={{ background: s.bg, color: s.cor, border: `1px solid ${s.cor}44` }}
    >
      {cat}
    </span>
  );
}

export function badgeStatusExec(status: string | null) {
  if (!status) return null;
  const ok = status === "ok" || status === "sucesso";
  return (
    <span
      className="badge tiny mono"
      style={{
        background: ok ? "oklch(0.72 0.18 145 / 0.12)" : "oklch(0.65 0.20 25 / 0.12)",
        color: ok ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.20 25)",
        border: `1px solid ${ok ? "oklch(0.72 0.18 145 / 0.3)" : "oklch(0.65 0.20 25 / 0.3)"}`,
      }}
    >
      {status}
    </span>
  );
}

// ─── formatadores ─────────────────────────────────────────────────────────────

export function formatarUltimaExec(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// ─── HeatmapExecucoes ─────────────────────────────────────────────────────────
// Grid 7 dias × 24h. Cada célula colore por saúde:
//   verde  = execução ok
//   vermelho = proporção de falhas
//   cinza  = sem dados

export function HeatmapExecucoes({ job }: { job: JobCron }) {
  const falhas = job.falhas_30d ?? 0;
  const totalCelulas = 7 * 24;
  const proporcaoFalha = Math.min(1, falhas / totalCelulas);

  return (
    <div
      className="grid gap-px"
      style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))", height: 28 }}
    >
      {Array.from({ length: totalCelulas }, (_, i) => {
        const posicaoRelativa = i / totalCelulas;
        const eFalha = falhas > 0 && posicaoRelativa < proporcaoFalha;
        const cor = eFalha
          ? "oklch(0.65 0.20 25)"
          : job.ultima_exec !== null
          ? "oklch(0.72 0.18 145)"
          : "oklch(0.32 0.01 240)";
        const op = 0.25 + (i / totalCelulas) * 0.75;
        return (
          <div
            key={i}
            className="rounded-sm"
            style={{ background: cor, opacity: op }}
          />
        );
      })}
    </div>
  );
}
