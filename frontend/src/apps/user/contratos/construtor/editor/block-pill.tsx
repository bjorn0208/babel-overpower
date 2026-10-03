/**
 * BlockPill — NodeView React para token de bloco no editor TipTap.
 *
 * Renderizado via ReactNodeViewRenderer quando o nó "blockToken" é criado.
 * Visual: card de bloco com ícone, rótulo, token técnico e botão remover.
 *
 * Mantém coerência com renderHTML do BlockToken extension — round-trip não é
 * afetado pois docParaTexto usa o tipo do nó (case "blockToken"), não o HTML.
 */

import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { MAP_TOKENS, abaDoToken, ROTULO_ABA, EVENTO_ABRIR_CONFIG } from "../tipos";

// Cor e estilo visual por token de bloco
const ESTILO_BLOCO: Record<
  string,
  { borda: string; fundo: string; cor: string; icone: string }
> = {
  "{ITENS_CONTRATADOS}": {
    borda: "oklch(0.65 0.22 280 / 0.4)",
    fundo: "oklch(0.65 0.22 280 / 0.07)",
    cor: "oklch(0.50 0.20 270)",
    icone: "📋",
  },
  "{CLAUSULAS_POR_PRODUTO}": {
    borda: "oklch(0.60 0.16 235 / 0.4)",
    fundo: "oklch(0.72 0.16 235 / 0.07)",
    cor: "oklch(0.40 0.16 235)",
    icone: "📄",
  },
  "{COND_PAGAMENTO}": {
    borda: "oklch(0.55 0.16 80 / 0.45)",
    fundo: "oklch(0.80 0.16 80 / 0.08)",
    cor: "oklch(0.35 0.14 80)",
    icone: "💳",
  },
  "{ASSINATURAS}": {
    borda: "oklch(0.65 0.22 280 / 0.4)",
    fundo: "oklch(0.65 0.22 280 / 0.07)",
    cor: "oklch(0.50 0.20 270)",
    icone: "✍️",
  },
};

const PADRAO_ESTILO = {
  borda: "oklch(0.65 0.22 280 / 0.4)",
  fundo: "oklch(0.65 0.22 280 / 0.07)",
  cor: "oklch(0.50 0.20 270)",
  icone: "🔧",
};

export function BlockPill({ node, deleteNode }: NodeViewProps) {
  const token = node.attrs.token as string;
  const info = MAP_TOKENS[token];
  const estilo = ESTILO_BLOCO[token] ?? PADRAO_ESTILO;

  // Mesmo atalho da pílula inline: o bloco leva à aba que o configura.
  const aba = abaDoToken(token);
  const abrirConfig = () => {
    if (!aba) return;
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_CONFIG, { detail: { aba, token } }));
  };

  return (
    <NodeViewWrapper
      as="div"
      style={{ margin: "6px 0", userSelect: "none" }}
      data-bloco-token={token}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          borderRadius: "10px",
          border: `1px dashed ${estilo.borda}`,
          background: estilo.fundo,
          color: estilo.cor,
          fontFamily: "var(--font-ui, system-ui)",
          fontSize: "12.5px",
          fontWeight: 500,
          position: "relative",
          cursor: aba ? "pointer" : "default",
        }}
        onClick={abrirConfig}
        title={aba ? `Clique para abrir "${ROTULO_ABA[aba]}"` : undefined}
      >
        {/* Ícone */}
        <span style={{ fontSize: "16px", flexShrink: 0 }}>{estilo.icone}</span>

        {/* Conteúdo */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "10.5px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "2px",
              opacity: 0.85,
            }}
          >
            {info?.rotulo ?? token}
          </div>
          <div style={{ fontSize: "12px", opacity: 0.7 }}>
            {info?.descricao ?? "Bloco automático"}
            {aba && (
              <span style={{ opacity: 0.75 }}> · configurado em <strong>{ROTULO_ABA[aba]}</strong></span>
            )}
          </div>
        </div>

        {/* Token técnico */}
        <code
          style={{
            fontSize: "10px",
            opacity: 0.45,
            fontFamily: "var(--font-mono, monospace)",
            flexShrink: 0,
          }}
        >
          {token}
        </code>

        {/* Botão remover */}
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteNode();
          }}
          title="Remover bloco"
          style={{
            position: "absolute",
            top: "6px",
            right: "8px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "20px",
            height: "20px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: estilo.cor,
            opacity: 0.5,
            fontSize: "14px",
            borderRadius: "4px",
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
    </NodeViewWrapper>
  );
}
