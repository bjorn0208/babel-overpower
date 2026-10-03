/** Linha do tempo do chamado (spec 7b): ordem de data, ícone por tipo, autor e "quando aconteceu"; importado marcado. */
import { rotuloEvento } from "./logica-chamados";
import { Selo } from "./ui-gestao";
import type { EventoChamado } from "./tipos";

const ICONE: Record<string, string> = {
  criacao: "●", nota_interna: "✎", contato_cliente: "☎", escalonamento: "↗", devolucao: "↙", fechamento: "✓", reabertura: "↺",
};
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function LinhaTempoChamado({ eventos }: { eventos: EventoChamado[] }) {
  if (eventos.length === 0) return <p className="muted tiny">Sem registros ainda.</p>;
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
      {eventos.map((e) => {
        const tardio = Math.abs(new Date(e.registrado_em).getTime() - new Date(e.aconteceu_em).getTime()) > 10 * 60e3;
        return (
          <li key={e.id} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 8 }}>
            <span aria-hidden style={{ opacity: 0.8 }}>{ICONE[e.tipo] ?? "•"}</span>
            <div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
                <strong>{rotuloEvento(e)}</strong>
                <span className="muted tiny">{e.autor_nome} · {dataHora(e.aconteceu_em)}</span>
                {e.tipo === "nota_interna" && <Selo tom="neutro">interno</Selo>}
                {e.origem === "importado" && <Selo tom="info">histórico importado</Selo>}
                {e.origem === "terminal" && <Selo tom="aurora">via terminal</Selo>}
                {e.origem === "sql" && <Selo tom="aviso">registro técnico</Selo>}
              </div>
              {e.texto && <div style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{e.texto}</div>}
              {tardio && <div className="muted tiny">registrado em {dataHora(e.registrado_em)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
