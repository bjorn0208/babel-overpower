// Painel lateral que mostra o conteúdo real do passo ativo no replay
// Sub-componentes de conteúdo em painel-passo-conteudo.tsx (limite 300 linhas)

import type { PassoReplay } from "./tipos-replay";
import {
  ConteudoTrace,
  ConteudoMensagem,
  ConteudoBolha,
} from "./painel-passo-conteudo";

interface PropsPainelPasso {
  passo: PassoReplay | null;
  indice: number;
  total: number;
}

// Cor de destaque por tipo de passo
const COR_TIPO: Record<string, string> = {
  trace: "oklch(0.55 0.18 240)",
  mensagem: "oklch(0.50 0.16 165)",
  bolha_saida: "oklch(0.50 0.18 290)",
};

const ICONE_TIPO: Record<string, string> = {
  trace: "⚙",
  mensagem: "💬",
  bolha_saida: "📤",
};

export default function PainelPasso({ passo, indice, total }: PropsPainelPasso) {
  if (!passo) {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 300,
          height: "100%",
          background: "oklch(0.12 0.02 240)",
          borderLeft: "1px solid oklch(0.22 0.03 240)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
          color: "oklch(0.40 0.03 240)",
          fontSize: 12,
          padding: 24,
          textAlign: "center",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 24, opacity: 0.4 }}>▶</span>
        <span>Escolha uma conversa e dê Play para ver o replay</span>
      </div>
    );
  }

  const corTipo = COR_TIPO[passo.tipo] ?? "oklch(0.40 0.05 240)";
  const icone = ICONE_TIPO[passo.tipo] ?? "•";

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 300,
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
          padding: "12px 14px 10px",
          borderBottom: "1px solid oklch(0.22 0.03 240)",
          background: corTipo,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "oklch(0.92 0.02 240)",
                marginBottom: 3,
              }}
            >
              {icone} passo {indice + 1} / {total}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "oklch(0.98 0.01 240)",
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {passo.conteudo.titulo}
            </div>
          </div>
        </div>

        {/* Nós do grafo associados */}
        {passo.nos_alvo.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {passo.nos_alvo.map((n) => (
              <span
                key={n}
                style={{
                  background: "oklch(0 0 0 / 0.28)",
                  borderRadius: 4,
                  color: "oklch(0.92 0.02 240)",
                  fontSize: 9,
                  padding: "2px 6px",
                  fontFamily: "monospace",
                }}
              >
                {n}
              </span>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div
          style={{
            marginTop: 5,
            fontSize: 10,
            color: "oklch(0.80 0.04 240)",
            fontFamily: "monospace",
          }}
        >
          {passo.criado_em
            ? new Date(passo.criado_em).toLocaleString("pt-BR")
            : "—"}
        </div>
      </div>

      {/* Corpo */}
      <div style={{ padding: "14px 14px 20px", flex: 1 }}>
        {passo.tipo === "trace" && <ConteudoTrace c={passo.conteudo} />}
        {passo.tipo === "mensagem" && <ConteudoMensagem c={passo.conteudo} />}
        {passo.tipo === "bolha_saida" && <ConteudoBolha c={passo.conteudo} />}
      </div>
    </div>
  );
}
