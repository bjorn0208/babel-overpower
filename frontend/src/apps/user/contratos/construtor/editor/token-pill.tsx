/**
 * TokenPill — NodeView React para token inline no editor TipTap.
 *
 * Renderizado pelo TipTap via NodeViewWrapper quando o nó "token" é criado.
 * Visual: pílula colorida por classe + botão remover + tooltip com descrição.
 *
 * Decisão: usado como addNodeView no TokenInline extension via ReactNodeViewRenderer.
 * Mantém coerência com renderHTML (mesmos data-token, data-classe) — round-trip
 * não é afetado pois docParaTexto usa o tipo do nó (case "token"), não o HTML.
 */

import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { detectarClasseToken, COR_TOKEN } from "./extensions/token-inline";
import { MAP_TOKENS, abaDoToken, ROTULO_ABA, EVENTO_ABRIR_CONFIG } from "../tipos";

export function TokenPill({ node, deleteNode }: NodeViewProps) {
  const token = node.attrs.token as string;
  const classe = detectarClasseToken(token);
  const { cor, fundo } = COR_TOKEN[classe];
  const info = MAP_TOKENS[token];

  // Pedido do Theus: clicar na pílula leva direto pra aba que configura este valor.
  // O NodeView do TipTap não recebe callback do pai, então avisa por CustomEvent —
  // o construtor escuta e troca a aba.
  const aba = abaDoToken(token);
  const abrirConfig = () => {
    if (!aba) return;
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_CONFIG, { detail: { aba, token } }));
  };

  return (
    <NodeViewWrapper
      as="span"
      style={{ display: "inline-flex", alignItems: "center", userSelect: "none" }}
    >
      <span
        data-token={token}
        data-classe={classe}
        title={
          aba
            ? `${info?.descricao ?? token} — clique para abrir "${ROTULO_ABA[aba]}"`
            : (info?.descricao ?? token)
        }
        onClick={abrirConfig}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          padding: "1px 6px",
          margin: "0 2px",
          background: fundo,
          color: cor,
          border: `1px solid ${cor.replace(")", " / 0.4)").replace("oklch(", "oklch(")}`,
          borderRadius: "999px",
          fontSize: "0.78em",
          fontWeight: 500,
          fontFamily: "var(--font-ui, system-ui)",
          whiteSpace: "nowrap",
          cursor: aba ? "pointer" : "default",
          verticalAlign: "baseline",
          lineHeight: 1.5,
          transition: "filter 100ms ease, transform 100ms ease",
          position: "relative",
        }}
        className="tok-pill-inline"
      >
        <span style={{ fontSize: "0.75em", opacity: 0.7 }}>●</span>
        <span>{info?.rotulo ?? token}</span>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteNode();
          }}
          title="Remover token"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: "2px",
            width: "14px",
            height: "14px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: cor,
            opacity: 0.55,
            padding: 0,
            fontSize: "10px",
            borderRadius: "50%",
          }}
        >
          ×
        </button>
      </span>
    </NodeViewWrapper>
  );
}
