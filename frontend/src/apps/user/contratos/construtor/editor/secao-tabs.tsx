/**
 * SecaoTabs — navegação entre seções do editor de contrato.
 *
 * Abas:
 *   - "Comum" — cláusulas que aparecem em todo contrato
 *   - Uma aba por produto aceito — cláusulas específicas do produto
 *   - Botão "+ Produto" — chama callback onAdicionarProduto (painel Preço, tijolo 2c)
 *
 * Estado de seção ativa fica no pai (editor-contrato.tsx).
 * Lista de produtos aceitos vem por prop — fonte real é o painel Preço (2c).
 */

import type { ProdutoAceito } from "../tipos";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type SecaoAtiva =
  | { tipo: "comum" }
  | { tipo: "produto"; produto_id: string };

export interface SecaoTabsProps {
  /** Produtos aceitos configurados no template (vem do painel Preço em 2c). */
  produtosAceitos: ProdutoAceito[];
  /** Função que resolve o nome do produto a partir do produto_id. */
  resolverNomeProduto?: (produto_id: string) => string;
  /** Seção atualmente ativa. */
  secaoAtiva: SecaoAtiva;
  /** Callback ao trocar de seção. */
  onTrocarSecao: (secao: SecaoAtiva) => void;
  /**
   * Callback ao clicar em "+ Produto".
   * O pai decide se abre o painel Preço (2c) ou um modal (2d).
   */
  onAdicionarProduto: () => void;
  /** Mapa produto_id → tem cláusulas (true = não está vazio). */
  mapClausulas?: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function SecaoTabs({
  produtosAceitos,
  resolverNomeProduto,
  secaoAtiva,
  onTrocarSecao,
  onAdicionarProduto,
  mapClausulas = {},
}: SecaoTabsProps) {
  const nomeProduto = (id: string) =>
    resolverNomeProduto?.(id) ?? `Produto ${id.slice(0, 6)}`;

  const comunAtiva = secaoAtiva.tipo === "comum";

  return (
    <div style={estilos.container}>
      {/* Aba Comum */}
      <button
        style={{
          ...estilos.tab,
          ...(comunAtiva ? estilos.tabAtiva : {}),
        }}
        onClick={() => onTrocarSecao({ tipo: "comum" })}
        title="Cláusulas que aparecem em todo contrato"
      >
        <span style={estilos.tabIcone}>📄</span>
        <span style={estilos.tabLabel}>Comum</span>
        <span style={estilos.pill}>sempre</span>
      </button>

      {/* Abas por produto */}
      {produtosAceitos.map((pa) => {
        const ativa =
          secaoAtiva.tipo === "produto" &&
          secaoAtiva.produto_id === pa.produto_id;
        const temClausulas = mapClausulas[pa.produto_id] ?? false;
        const nome = nomeProduto(pa.produto_id);

        return (
          <button
            key={pa.produto_id}
            style={{
              ...estilos.tab,
              ...(ativa ? estilos.tabAtiva : {}),
            }}
            onClick={() =>
              onTrocarSecao({ tipo: "produto", produto_id: pa.produto_id })
            }
            title={`Cláusulas específicas do produto "${nome}"`}
          >
            <span style={estilos.tabIcone}>📦</span>
            <span
              style={{
                ...estilos.tabLabel,
                maxWidth: "100px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {nome}
            </span>
            {!temClausulas && (
              <span
                style={{
                  ...estilos.pill,
                  background: "oklch(1 0 0 / 0.04)",
                  color: "oklch(0.97 0.005 270 / 0.42)",
                  borderColor: "oklch(1 0 0 / 0.08)",
                }}
              >
                vazio
              </span>
            )}
          </button>
        );
      })}

      {/* Botão adicionar produto */}
      <button
        style={estilos.tabAdicionar}
        onClick={onAdicionarProduto}
        title="Adicionar produto para criar cláusulas específicas"
      >
        <span style={{ fontSize: "12px" }}>+</span>
        <span style={estilos.tabLabel}>
          {produtosAceitos.length === 0 ? "Adicionar produto" : "Produto"}
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const estilos = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    padding: "6px 8px",
    borderBottom: "1px solid oklch(1 0 0 / 0.06)",
    background: "oklch(0.18 0.025 275 / 0.6)",
    overflowX: "auto" as const,
    flexShrink: 0,
  } as React.CSSProperties,
  tab: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "5px 10px",
    fontSize: "12px",
    fontWeight: 500,
    fontFamily: "var(--font-ui, system-ui)",
    color: "oklch(0.97 0.005 270 / 0.65)",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: "8px",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
    flexShrink: 0,
  } as React.CSSProperties,
  tabAtiva: {
    background: "oklch(0.72 0.18 295 / 0.12)",
    color: "oklch(0.97 0.005 270)",
    borderColor: "oklch(0.72 0.18 295 / 0.35)",
  } as React.CSSProperties,
  tabAdicionar: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "5px 10px",
    fontSize: "12px",
    fontWeight: 500,
    fontFamily: "var(--font-ui, system-ui)",
    color: "oklch(0.97 0.005 270 / 0.42)",
    background: "transparent",
    border: "1px dashed oklch(1 0 0 / 0.12)",
    borderRadius: "8px",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    transition: "background 120ms ease, color 120ms ease",
    flexShrink: 0,
    marginLeft: "4px",
  } as React.CSSProperties,
  tabIcone: {
    fontSize: "11px",
    flexShrink: 0,
  } as React.CSSProperties,
  tabLabel: {
    display: "inline-block",
  } as React.CSSProperties,
  pill: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: "9px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    padding: "1px 6px",
    borderRadius: "999px",
    background: "oklch(0.72 0.18 295 / 0.14)",
    color: "oklch(0.72 0.18 295)",
    border: "1px solid oklch(0.72 0.18 295 / 0.3)",
  } as React.CSSProperties,
};
