/**
 * Anel de uso do plano (SVG): quanto das conversas do mês já foi consumido.
 * Número central = quantas ainda restam (a informação acionável pro tenant);
 * a cor do arco acompanha o consumo (verde → amarelo → vermelho).
 */

interface AnelUsoPlanoProps {
  usadas: number;
  max: number;
  size?: number;
}

export function AnelUsoPlano({ usadas, max, size = 124 }: AnelUsoPlanoProps) {
  const total = Math.max(max, 1);
  const pct = Math.min(usadas / total, 1);
  const restantes = Math.max(total - usadas, 0);

  const cor =
    pct >= 0.9
      ? "oklch(0.70 0.20 25)"
      : pct >= 0.7
        ? "oklch(0.80 0.16 95)"
        : "oklch(0.75 0.16 150)";

  const stroke = 9;
  const raio = (size - stroke) / 2;
  const circ = 2 * Math.PI * raio;

  return (
    <div
      role="img"
      aria-label={`${usadas} de ${total} conversas usadas neste ciclo; restam ${restantes}.`}
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={raio}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={raio}
          fill="none"
          stroke={cor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1.1,
        }}
      >
        <span className="mono" style={{ fontSize: 26, fontWeight: 700 }}>
          {restantes}
        </span>
        <span className="tiny muted">restantes</span>
        <span className="tiny muted mono" style={{ marginTop: 2 }}>
          de {total}
        </span>
      </div>
    </div>
  );
}
