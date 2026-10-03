/**
 * tabs.tsx — Navegação das 6 abas do painel direito do construtor.
 *
 * Rótulos completos em pt-BR com scroll horizontal em telas estreitas.
 * Não contém estado — só renderiza e emite onClick.
 */

import React from "react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type TabId =
  | "preco"
  | "campos"
  | "pagamento"
  | "provas"
  | "preview"
  | "lead";

export interface Tab {
  id: TabId;
  rotulo: string;
}

export const TABS: Tab[] = [
  { id: "preco",    rotulo: "Preço" },
  { id: "campos",   rotulo: "Campos do contato" },
  { id: "pagamento", rotulo: "Pagamento" },
  { id: "provas",   rotulo: "Provas" },
  { id: "preview",  rotulo: "Preview" },
  { id: "lead",     rotulo: "Página do lead" },
];

export interface TabsProps {
  ativa: TabId;
  onChange: (tab: TabId) => void;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

const estilos = {
  container: {
    display: "flex",
    overflowX: "auto" as const,
    borderBottom: "1px solid oklch(0.22 0.01 270)",
    background: "oklch(0.14 0.01 270)",
    flexShrink: 0,
    scrollbarWidth: "none" as const,
  },
  tab: (ativa: boolean): React.CSSProperties => ({
    padding: "9px 14px",
    fontSize: 12,
    fontWeight: ativa ? 700 : 500,
    color: ativa ? "oklch(0.95 0 0)" : "oklch(0.55 0.01 270)",
    background: "transparent",
    border: "none",
    borderBottom: ativa
      ? "2px solid oklch(0.72 0.18 295)"
      : "2px solid transparent",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    transition: "color 120ms ease, border-color 120ms ease",
    flexShrink: 0,
  }),
};

export function Tabs({ ativa, onChange }: TabsProps): React.ReactElement {
  return (
    <div style={estilos.container} role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={ativa === tab.id}
          style={estilos.tab(ativa === tab.id)}
          onClick={() => onChange(tab.id)}
        >
          {tab.rotulo}
        </button>
      ))}
    </div>
  );
}
