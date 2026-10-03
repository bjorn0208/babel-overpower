/**
 * estilos-construtor.ts — Estilos do orquestrador ConstrutorTemplate.
 * Extraídos pra manter construtor-template.tsx ≤ 300 linhas (F3c).
 */

import type React from "react";

export const estilosConstrutor = {
  wrapper:       { display: "flex", height: "100%", overflow: "hidden", background: "oklch(0.11 0.01 270)" } as React.CSSProperties,
  colunaEditor:  { flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column" as const, borderRight: "1px solid oklch(0.22 0.01 270)", overflow: "hidden" },
  colunaDireita: { width: 340, flexShrink: 0, display: "flex", flexDirection: "column" as const, overflow: "hidden" },
  corpoDireito:  { flex: 1, overflowY: "auto" as const, padding: "16px 14px" },
  barraSelector: { padding: "8px 12px", borderBottom: "1px solid oklch(0.22 0.01 270)", flexShrink: 0 },
  btnSelector: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "6px 10px", borderRadius: 8,
    border: "1px solid oklch(0.26 0.01 270)", background: "oklch(0.16 0.01 270)",
    cursor: "pointer", width: "100%", textAlign: "left" as const,
  },
  btnSelectorNome: {
    flex: 1, fontSize: 13, fontWeight: 600, color: "oklch(0.92 0 0)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
  },
  btnSelectorCount:   { fontSize: 10.5, color: "oklch(0.50 0.01 270)", flexShrink: 0 },
  badgeSelectorAtivo: {
    fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 99,
    background: "oklch(0.74 0.16 150 / 0.15)", color: "oklch(0.74 0.16 150)", flexShrink: 0,
  },
};
