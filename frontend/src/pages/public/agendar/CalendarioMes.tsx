/**
 * Calendário mensal da página pública de agendamento.
 * Mostra o mês, permite navegar pros próximos (limitado pela config do tenant).
 * Só dias com horário livre ficam clicáveis — a agenda interna nunca vaza.
 *
 * Datas tratadas como chaves "YYYY-MM-DD" (BRT), sem depender do fuso do browser.
 */
import { PpIcone } from "../contrato/PpIcone";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Props = {
  ano: number;
  mes: number; // 0-11
  hoje: string; // "YYYY-MM-DD" em BRT
  diasComSlot: Set<string>;
  diaSel: string | null;
  podeVoltar: boolean;
  podeAvancar: boolean;
  onVoltar: () => void;
  onAvancar: () => void;
  onSelecionarDia: (chave: string) => void;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function CalendarioMes({
  ano, mes, hoje, diasComSlot, diaSel,
  podeVoltar, podeAvancar, onVoltar, onAvancar, onSelecionarDia,
}: Props) {
  // Grid determinístico: meia-noite UTC só pra descobrir weekday/qtd de dias.
  const primeiroDow = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const titulo = new Date(ano, mes, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const celulas: (number | null)[] = [];
  for (let i = 0; i < primeiroDow; i++) celulas.push(null);
  for (let d = 1; d <= diasNoMes; d++) celulas.push(d);
  while (celulas.length % 7 !== 0) celulas.push(null);

  return (
    <div className="pp-cal">
      <div className="pp-cal-head">
        <span className="pp-cal-title">{titulo}</span>
        <div className="pp-cal-nav">
          <button type="button" className="pp-cal-arrow" onClick={onVoltar} disabled={!podeVoltar} aria-label="Mês anterior">
            <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}><PpIcone nome="chevr" tamanho={15} /></span>
          </button>
          <button type="button" className="pp-cal-arrow" onClick={onAvancar} disabled={!podeAvancar} aria-label="Próximo mês">
            <PpIcone nome="chevr" tamanho={15} />
          </button>
        </div>
      </div>

      <div className="pp-cal-dow">
        {DOW.map((d) => <span key={d}>{d}</span>)}
      </div>

      <div className="pp-cal-grid">
        {celulas.map((d, i) => {
          if (d === null) return <div key={`e${i}`} className="pp-cal-cell pp-cal-empty" />;
          const chave = `${ano}-${pad(mes + 1)}-${pad(d)}`;
          const temSlot = diasComSlot.has(chave);
          const passado = chave < hoje;
          const ehHoje = chave === hoje;
          const selecionado = chave === diaSel;
          const classe = [
            "pp-cal-cell",
            temSlot && !selecionado ? "has-slots" : "",
            selecionado ? "is-selected" : "",
            ehHoje ? "is-today" : "",
            !temSlot ? "is-disabled" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              key={chave}
              type="button"
              className={classe}
              disabled={!temSlot || passado}
              onClick={() => onSelecionarDia(chave)}
            >
              {d}
              {temSlot && <span className="pp-cal-dot" />}
            </button>
          );
        })}
      </div>

      <div className="pp-cal-legend">
        <i /> dias com horário livre
      </div>
    </div>
  );
}
