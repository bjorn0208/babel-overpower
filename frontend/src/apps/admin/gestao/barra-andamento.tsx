/**
 * Coluna "Andamento" das listas de Implementação e Suporte — artefato :2117-2121 e :2754-2758:
 * "Dia X de 15" (ou "Passou dos 15 dias (dia N)"), a barra `.progress` do bundle e o rodapé.
 */

/** "Dia X de 15" + barra + rodapé; passou do prazo → texto e barra em aviso (REVISAO-VISUAL-CORES #46). */
export function BarraAndamento({
  andamento,
  rodape,
}: {
  andamento: { passou: boolean; texto: string; pct: number };
  rodape: string;
}) {
  return (
    <div>
      <div className="small" style={{ fontWeight: 600, color: andamento.passou ? "var(--os-aviso)" : undefined }}>
        {andamento.texto}
      </div>
      <div className="progress" style={{ margin: "4px 0" }}>
        <div style={{ width: `${andamento.pct}%`, background: andamento.passou ? "var(--os-aviso)" : undefined }} />
      </div>
      <div className="muted tiny">{rodape}</div>
    </div>
  );
}
