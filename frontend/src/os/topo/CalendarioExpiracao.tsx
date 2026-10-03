/**
 * Calendário do mês da expiração do plano: os dias que faltam até o vencimento
 * aparecem contados (preenchimento suave) e o último dia vem cravado com anel.
 * É a resposta visual pra "quando meu plano acaba?" sem fazer conta de cabeça.
 */

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Constrói Date local a partir do trecho YYYY-MM-DD (ignora hora/fuso do ISO). */
function dataLocal(iso: string): Date | null {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
}

interface CalendarioExpiracaoProps {
  dataExpiracao: string;
  /** cor de urgência (mesma da pílula) — pinta a contagem e o último dia. */
  cor: string;
}

export function CalendarioExpiracao({ dataExpiracao, cor }: CalendarioExpiracaoProps) {
  const expira = dataLocal(dataExpiracao);
  if (!expira) return null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const ano = expira.getFullYear();
  const mes = expira.getMonth();
  const primeiroDia = new Date(ano, mes, 1);
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const offsetInicio = primeiroDia.getDay();

  const celulas: (number | null)[] = [
    ...Array.from({ length: offsetInicio }, () => null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="small" style={{ fontWeight: 600 }}>
          {MESES[mes]} {ano}
        </span>
        <span className="tiny muted">
          último dia ·{" "}
          <span className="mono" style={{ color: cor, fontWeight: 700 }}>
            {String(expira.getDate()).padStart(2, "0")}/{String(mes + 1).padStart(2, "0")}
          </span>
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 3,
          textAlign: "center",
        }}
      >
        {DIAS_SEMANA.map((d, i) => (
          <span key={`ds-${i}`} className="tiny muted" aria-hidden="true">
            {d}
          </span>
        ))}
        {celulas.map((dia, i) => {
          if (dia === null) return <span key={`v-${i}`} />;
          const data = new Date(ano, mes, dia);
          const ehUltimo = dia === expira.getDate();
          const contado = data >= hoje && data <= expira;
          const passado = data < hoje;
          return (
            <span
              key={dia}
              className="mono tiny"
              aria-label={ehUltimo ? `dia ${dia}, último dia do plano` : undefined}
              style={{
                padding: "5px 0",
                borderRadius: 8,
                fontWeight: ehUltimo ? 700 : 500,
                color: ehUltimo
                  ? "oklch(0.15 0.02 264)"
                  : contado
                    ? "var(--txt-1, rgba(255,255,255,0.9))"
                    : "rgba(255,255,255,0.28)",
                background: ehUltimo
                  ? cor
                  : contado
                    ? "rgba(255,255,255,0.07)"
                    : "transparent",
                boxShadow: ehUltimo ? `0 0 0 2px ${cor}, 0 0 14px ${cor}` : "none",
                textDecoration: passado ? "line-through" : "none",
                opacity: passado ? 0.5 : 1,
              }}
            >
              {dia}
            </span>
          );
        })}
      </div>
    </div>
  );
}
