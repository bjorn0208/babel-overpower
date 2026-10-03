// Painel lateral "Ragentic-Lab (gap)" — detalhe da peça selecionada
// Fase C3 — Mapa do Motor Vivo

import type { PecaLab, CoberturaMotor } from "./tipos-lab";
import { SECAO_LABELS } from "./inventario-lab";

interface PropsPainelLab {
  peca: PecaLab | null;
  aoFechar: () => void;
}

const COR_COBERTURA: Record<CoberturaMotor, string> = {
  tem: "oklch(0.60 0.16 145)",
  parcial: "oklch(0.70 0.18 60)",
  falta: "oklch(0.60 0.20 20)",
  "?": "oklch(0.50 0.05 240)",
};

const DESCRICAO_COBERTURA: Record<CoberturaMotor, string> = {
  tem: "Existe um nó no motor de hoje com função equivalente clara.",
  parcial:
    "O motor de hoje cobre parte desta capacidade, mas não integralmente.",
  falta:
    "Sem correspondente identificado no motor de hoje — candidato a portar.",
  "?": "Incerto — correspondência ambígua. Confirme manualmente.",
};

const LABEL_MATURIDADE: Record<string, string> = {
  implementada: "Implementada no lab",
  parcial: "Parcial no lab",
  "doc-only": "Só documentada (sem código)",
  INCERTO: "Status incerto no lab",
};

export default function PainelLab({ peca, aoFechar }: PropsPainelLab) {
  if (!peca) {
    return (
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 300,
          background: "oklch(0.13 0.03 240)",
          borderLeft: "1px solid oklch(0.22 0.03 240)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 20,
        }}
      >
        <span style={{ fontSize: 28, opacity: 0.3 }}>🔬</span>
        <span
          style={{
            fontSize: 12,
            color: "oklch(0.45 0.04 240)",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Clique em uma peça da lista para ver detalhes e correspondência no
          motor de hoje
        </span>
      </div>
    );
  }

  const corCobertura = COR_COBERTURA[peca.cobertura];

  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 300,
        background: "oklch(0.13 0.03 240)",
        borderLeft: "1px solid oklch(0.22 0.03 240)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Cabeçalho */}
      <div
        style={{
          padding: "12px 14px 10px",
          borderBottom: "1px solid oklch(0.20 0.03 240)",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "oklch(0.95 0.02 240)",
              lineHeight: 1.3,
              marginBottom: 4,
            }}
          >
            {peca.nome}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "oklch(0.50 0.04 240)",
              fontStyle: "italic",
            }}
          >
            {SECAO_LABELS[peca.secao] ?? peca.secao}
          </div>
        </div>
        <button
          onClick={aoFechar}
          style={{
            background: "transparent",
            border: "none",
            color: "oklch(0.50 0.04 240)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
            flexShrink: 0,
          }}
          aria-label="Fechar painel"
        >
          ×
        </button>
      </div>

      {/* Conteúdo scrollável */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {/* Cobertura no motor de hoje */}
        <div
          style={{
            background: `${corCobertura}18`,
            border: `1px solid ${corCobertura}44`,
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: corCobertura,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: corCobertura,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Cobertura: {peca.cobertura}
            </span>
          </div>
          <p
            style={{
              fontSize: 11,
              color: "oklch(0.65 0.04 240)",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {DESCRICAO_COBERTURA[peca.cobertura]}
          </p>
          <p
            style={{
              fontSize: 10,
              color: "oklch(0.42 0.04 240)",
              lineHeight: 1.4,
              margin: "6px 0 0",
              fontStyle: "italic",
            }}
          >
            Cruzamento heurístico por nome/conceito — confirme manualmente
          </p>
        </div>

        {/* Nós correspondentes */}
        {peca.nos_correspondentes.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "oklch(0.55 0.05 240)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 5,
              }}
            >
              Nó(s) no motor de hoje
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {peca.nos_correspondentes.map((id) => (
                <span
                  key={id}
                  style={{
                    fontSize: 10,
                    background: "oklch(0.22 0.05 240)",
                    border: "1px solid oklch(0.35 0.06 240)",
                    borderRadius: 4,
                    color: "oklch(0.80 0.06 240)",
                    padding: "2px 7px",
                    fontFamily: "monospace",
                  }}
                >
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}

        {peca.cobertura === "falta" && (
          <div
            style={{
              background: "oklch(0.18 0.04 20)",
              border: "1px solid oklch(0.30 0.08 20)",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "oklch(0.70 0.12 20)",
                fontWeight: 600,
              }}
            >
              Candidato a portar
            </span>
            <p
              style={{
                fontSize: 10,
                color: "oklch(0.55 0.08 20)",
                margin: "4px 0 0",
                lineHeight: 1.4,
              }}
            >
              Esta peça não tem equivalente no motor de produção atual. Pode ser
              relevante para uma próxima onda de implementação.
            </p>
          </div>
        )}

        {/* O que faz */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "oklch(0.55 0.05 240)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 5,
            }}
          >
            O que faz
          </div>
          <p
            style={{
              fontSize: 12,
              color: "oklch(0.78 0.03 240)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {peca.o_que_faz}
          </p>
        </div>

        {/* Maturidade */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "oklch(0.55 0.05 240)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 5,
            }}
          >
            Maturidade no lab
          </div>
          <span
            style={{
              fontSize: 11,
              color:
                peca.maturidade === "implementada"
                  ? "oklch(0.65 0.14 145)"
                  : peca.maturidade === "INCERTO"
                  ? "oklch(0.60 0.10 60)"
                  : "oklch(0.60 0.10 240)",
              fontWeight: 600,
            }}
          >
            {LABEL_MATURIDADE[peca.maturidade] ?? peca.maturidade}
          </span>
        </div>

        {/* Onde no lab */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "oklch(0.55 0.05 240)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 5,
            }}
          >
            Onde no lab
          </div>
          <code
            style={{
              fontSize: 10,
              color: "oklch(0.65 0.08 180)",
              background: "oklch(0.17 0.02 240)",
              borderRadius: 4,
              padding: "4px 8px",
              display: "block",
              lineHeight: 1.6,
              wordBreak: "break-all",
            }}
          >
            {peca.onde_no_lab}
          </code>
        </div>
      </div>
    </div>
  );
}
