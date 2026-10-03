// @ts-nocheck
/**
 * MetricaCard — card de KPI genérico da Curadoria.
 * Extraído de AbaChamadasLlm.tsx (Onda 9).
 */

export interface MetricaCardProps {
  label: string;
  valor: string | number;
  unidade?: string;
  cor?: string;
}

export function MetricaCard({ label, valor, unidade, cor }: MetricaCardProps) {
  return (
    <div className="os-card p-3">
      <div className="tiny uppercase text-txt3 mb-1">{label}</div>
      <div
        className="kpi-num tabular-nums"
        style={cor ? { color: cor } : undefined}
      >
        {valor}
        {unidade && <span className="tiny muted ml-1">{unidade}</span>}
      </div>
    </div>
  );
}
