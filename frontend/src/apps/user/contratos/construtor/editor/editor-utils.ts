/**
 * editor-utils.ts — utilitários internos do editor-contrato.
 * Extraído para manter editor-contrato.tsx ≤ 300 linhas.
 */

import type { CSSProperties } from "react";

/** Posiciona o container do slash popup dentro da viewport. */
export function posicionarSlashContainer(
  container: HTMLElement,
  rect: DOMRect
): void {
  const LARGURA = 320;
  const MARGEM = 8;
  let left = rect.left;
  let top = rect.bottom + MARGEM;

  if (left + LARGURA > window.innerWidth - MARGEM)
    left = window.innerWidth - LARGURA - MARGEM;
  if (top + 380 > window.innerHeight) top = rect.top - 380 - MARGEM;

  container.style.left = `${Math.max(MARGEM, left)}px`;
  container.style.top = `${Math.max(MARGEM, top)}px`;
}

/** Estilos do frame principal, área de scroll e papel do documento. */
export const estilosEditor: Record<string, CSSProperties> = {
  frame: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    background: "oklch(0.20 0.028 275)",
    border: "1px solid oklch(1 0 0 / 0.06)",
    borderRadius: "14px",
    overflow: "hidden",
  },
  scroll: {
    flex: 1,
    overflowY: "auto",
    padding: "28px 28px 80px",
    minHeight: 0,
  },
  papel: {
    maxWidth: "720px",
    margin: "0 auto",
    background: "oklch(0.98 0.005 90)",
    color: "oklch(0.20 0.015 270)",
    borderRadius: "8px",
    padding: "64px 72px 80px",
    boxShadow:
      "0 30px 80px oklch(0 0 0 / 0.35), 0 0 0 1px oklch(1 0 0 / 0.06)",
    fontFamily: "var(--font-doc, 'Source Serif 4', Georgia, serif)",
    fontSize: "15px",
    lineHeight: 1.7,
    position: "relative",
  },
  placeholder: {
    position: "absolute",
    top: "64px",
    left: "72px",
    right: "72px",
    color: "oklch(0.55 0.02 270)",
    fontFamily: "var(--font-ui, system-ui)",
    fontSize: "14px",
    pointerEvents: "none",
    userSelect: "none",
  },
};
