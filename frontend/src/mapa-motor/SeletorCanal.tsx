// Seletor de canal — filtra nós/edges exibidos no grafo
// Opções: Conversas (externo) | Mentor/Admin (interno) | Tudo

import type { FiltroCanal } from "./tipos";

interface OpcaoCanal {
  valor: FiltroCanal;
  label: string;
  descricao: string;
  cor: string;
}

const OPCOES: OpcaoCanal[] = [
  {
    valor: "externo",
    label: "Conversas",
    descricao: "Lead → WhatsApp → Motor",
    cor: "oklch(0.55 0.18 240)",
  },
  {
    valor: "interno",
    label: "Mentor / Admin",
    descricao: "CommandBar → Motor",
    cor: "oklch(0.50 0.18 290)",
  },
  {
    valor: "todos",
    label: "Tudo",
    descricao: "Ambos os canais",
    cor: "oklch(0.50 0.16 165)",
  },
];

interface PropsSeletorCanal {
  valor: FiltroCanal;
  aoMudar: (filtro: FiltroCanal) => void;
  totalNos: number;
}

export default function SeletorCanal({
  valor,
  aoMudar,
  totalNos,
}: PropsSeletorCanal) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        background: "oklch(0.12 0.02 240)",
        borderBottom: "1px solid oklch(0.22 0.03 240)",
        flexShrink: 0,
      }}
    >
      {/* Título */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "oklch(0.55 0.04 240)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginRight: 4,
          whiteSpace: "nowrap",
        }}
      >
        Canal
      </div>

      {/* Botões de opção */}
      <div style={{ display: "flex", gap: 6 }}>
        {OPCOES.map((opcao) => {
          const ativo = valor === opcao.valor;
          return (
            <button
              key={opcao.valor}
              onClick={() => aoMudar(opcao.valor)}
              title={opcao.descricao}
              style={{
                background: ativo ? opcao.cor : "oklch(0.18 0.02 240)",
                border: `1.5px solid ${ativo ? opcao.cor : "oklch(0.28 0.03 240)"}`,
                borderRadius: 6,
                color: ativo ? "oklch(0.98 0.01 240)" : "oklch(0.65 0.03 240)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: ativo ? 700 : 500,
                padding: "4px 12px",
                transition:
                  "background 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out",
              }}
            >
              {opcao.label}
            </button>
          );
        })}
      </div>

      {/* Contador de nós visíveis */}
      <div
        style={{
          marginLeft: "auto",
          fontSize: 11,
          color: "oklch(0.5 0.04 240)",
          whiteSpace: "nowrap",
        }}
      >
        {totalNos} {totalNos === 1 ? "nó" : "nós"}
      </div>
    </div>
  );
}
