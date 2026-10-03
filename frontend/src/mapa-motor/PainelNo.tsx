// Painel lateral de detalhes do nó selecionado
// Mostra: faz, ativa_proximo, fonte_dado_real, ref
// Destaque visual se texto contiver "INCERTO" (nota de investigação, não erro)

import { COR_CANAL, LABEL_CANAL } from "./layout";
import type { CanalNo } from "./tipos";

interface DadosPainel {
  label: string;
  canal: CanalNo;
  faz: string;
  ativa_proximo: string;
  fonte_dado_real: string;
  ref: string;
}

interface PropsPainelNo {
  dados: DadosPainel | null;
  aoFechar: () => void;
}

function temIncerto(texto: string): boolean {
  return texto.toUpperCase().includes("INCERTO");
}

function LinhaDetalhe({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  const incerto = temIncerto(valor);
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "oklch(0.6 0.04 240)",
          marginBottom: 3,
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          fontSize: 12,
          color: incerto ? "oklch(0.85 0.18 60)" : "oklch(0.92 0.02 240)",
          background: incerto
            ? "oklch(0.35 0.08 60 / 0.25)"
            : "oklch(0.18 0.02 240)",
          borderRadius: 6,
          padding: "6px 8px",
          lineHeight: 1.5,
          wordBreak: "break-word",
          border: incerto
            ? "1px solid oklch(0.6 0.15 60 / 0.4)"
            : "1px solid oklch(0.25 0.03 240)",
        }}
      >
        {incerto && (
          <span
            style={{
              display: "inline-block",
              background: "oklch(0.6 0.18 60)",
              color: "oklch(0.1 0.02 60)",
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 3,
              padding: "1px 5px",
              marginRight: 6,
              letterSpacing: "0.04em",
            }}
          >
            INCERTO
          </span>
        )}
        {valor}
      </div>
    </div>
  );
}

export default function PainelNo({ dados, aoFechar }: PropsPainelNo) {
  if (!dados) return null;

  const corCanal = COR_CANAL[dados.canal] ?? "oklch(0.3 0.05 240)";
  const labelCanal = LABEL_CANAL[dados.canal] ?? dados.canal;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 320,
        height: "100%",
        background: "oklch(0.12 0.02 240)",
        borderLeft: "1px solid oklch(0.22 0.03 240)",
        overflowY: "auto",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Cabeçalho */}
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid oklch(0.22 0.03 240)",
          background: corCanal,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "oklch(0.9 0.04 240)",
                marginBottom: 4,
              }}
            >
              {labelCanal}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "oklch(0.98 0.01 240)",
                lineHeight: 1.3,
              }}
            >
              {dados.label}
            </div>
          </div>
          <button
            onClick={aoFechar}
            aria-label="Fechar painel"
            style={{
              background: "oklch(0 0 0 / 0.25)",
              border: "none",
              borderRadius: 6,
              color: "oklch(0.9 0.02 240)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: "4px 8px",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div style={{ padding: "16px", flex: 1 }}>
        <LinhaDetalhe titulo="O que faz" valor={dados.faz} />
        <LinhaDetalhe titulo="Ativa próximo" valor={dados.ativa_proximo} />
        <LinhaDetalhe titulo="Fonte do dado real" valor={dados.fonte_dado_real} />
        <LinhaDetalhe titulo="Referência no código" valor={dados.ref} />
      </div>
    </div>
  );
}
