/**
 * ToolbarContrato — barra de ferramentas do editor de contrato.
 *
 * Extraída de editor-contrato.tsx para manter cada arquivo ≤ 300 linhas.
 * Recebe o editor TipTap e a seção ativa — sem estado próprio.
 */

import { useEditor } from "@tiptap/react";
import type { SecaoAtiva } from "./secao-tabs";

interface ToolbarContratoProps {
  editor: ReturnType<typeof useEditor>;
  secaoAtiva: SecaoAtiva;
}

export function ToolbarContrato({ editor, secaoAtiva }: ToolbarContratoProps) {
  if (!editor) return null;

  return (
    <div style={es.toolbar}>
      {/* Formato de bloco */}
      <button
        style={es.tbBtn}
        title="Parágrafo"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().setParagraph().run();
        }}
      >
        ¶
      </button>
      <button
        style={es.tbBtn}
        title="Título grande"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleHeading({ level: 1 }).run();
        }}
      >
        H1
      </button>
      <button
        style={es.tbBtn}
        title="Subtítulo"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleHeading({ level: 2 }).run();
        }}
      >
        H2
      </button>

      <span style={es.sep} />

      {/* Formatação inline */}
      <button
        style={{
          ...es.tbBtn,
          ...(editor.isActive("bold") ? es.tbBtnAtivo : {}),
        }}
        title="Negrito (Ctrl+B)"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleBold().run();
        }}
      >
        <strong>B</strong>
      </button>
      <button
        style={{
          ...es.tbBtn,
          ...(editor.isActive("italic") ? es.tbBtnAtivo : {}),
        }}
        title="Itálico (Ctrl+I)"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleItalic().run();
        }}
      >
        <em>I</em>
      </button>

      <span style={es.sep} />

      {/* Botão inserir token via slash */}
      <button
        style={es.tbBtnInserir}
        title='Insere bloco ou token (mesmo que digitar "/")'
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().insertContent("/").run();
        }}
      >
        <span>+ Inserir</span>
        <kbd style={es.kbd}>/</kbd>
      </button>

      {/* Label da seção ativa */}
      <span style={es.secaoLabel}>
        {secaoAtiva.tipo === "comum" ? "Seção comum" : "Cláusula de produto"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const es = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "6px 10px",
    borderBottom: "1px solid oklch(1 0 0 / 0.06)",
    background: "oklch(0.18 0.025 275 / 0.6)",
    flexWrap: "nowrap" as const,
    overflowX: "auto" as const,
    flexShrink: 0,
  } as React.CSSProperties,
  tbBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: "6px",
    cursor: "pointer",
    color: "oklch(0.97 0.005 270 / 0.65)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "12px",
    fontWeight: 600,
    transition: "background 100ms ease, color 100ms ease",
    flexShrink: 0,
  } as React.CSSProperties,
  tbBtnAtivo: {
    background: "oklch(0.72 0.18 295 / 0.18)",
    color: "oklch(0.97 0.005 270)",
    borderColor: "oklch(0.72 0.18 295 / 0.35)",
  } as React.CSSProperties,
  tbBtnInserir: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 10px",
    height: "28px",
    background: "oklch(0.72 0.18 295 / 0.14)",
    border: "1px solid oklch(0.72 0.18 295 / 0.35)",
    borderRadius: "8px",
    cursor: "pointer",
    color: "oklch(0.97 0.005 270)",
    fontFamily: "var(--font-ui, system-ui)",
    fontSize: "12px",
    fontWeight: 600,
    transition: "background 100ms ease",
    flexShrink: 0,
  } as React.CSSProperties,
  sep: {
    display: "block",
    width: "1px",
    height: "18px",
    background: "oklch(1 0 0 / 0.10)",
    margin: "0 4px",
    flexShrink: 0,
  } as React.CSSProperties,
  kbd: {
    display: "inline-block",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "10px",
    padding: "1px 5px",
    background: "oklch(0.14 0.02 275)",
    border: "1px solid oklch(1 0 0 / 0.14)",
    borderBottomWidth: "2px",
    borderRadius: "4px",
    color: "oklch(0.97 0.005 270 / 0.65)",
  } as React.CSSProperties,
  secaoLabel: {
    marginLeft: "auto",
    fontSize: "10.5px",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "oklch(0.97 0.005 270 / 0.35)",
    flexShrink: 0,
  } as React.CSSProperties,
} as const;
