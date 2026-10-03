/**
 * PainelPreco — CRUD de produtos aceitos + modo de preço.
 *
 * Recebe template + onPatch (controlado pelo pai — 2e fará fiação com banco).
 * Callback onEditarClausulas(produto_id) troca secaoAtiva no editor (2b).
 */

import { useState } from "react";
import type { TemplateV2, ProdutoAceito } from "../tipos";
import { brl } from "./logica";
import type { ProdutoRef } from "./logica";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PainelPrecoProps {
  template: TemplateV2;
  onPatch: (parcial: Partial<TemplateV2>) => void;
  /** Callback: troca a secaoAtiva do editor para a aba do produto */
  onEditarClausulas: (produto_id: string) => void;
  /** Lista de produtos do tenant (vem do pai — 2e injeta via Supabase) */
  produtosDisponiveis: ProdutoRef[];
}

// ---------------------------------------------------------------------------
// Sub-componente: input de preço BRL
// ---------------------------------------------------------------------------

function PrecoInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <label style={estilos.label}>{label}</label>
      <div style={{ position: "relative" }}>
        <span style={estilos.prefixoBrl}>R$</span>
        <input
          style={{ ...estilos.input, paddingLeft: 32 }}
          type="number"
          min={0}
          step={0.01}
          value={value || 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      </div>
      {hint && <div style={estilos.hint}>{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: linha de produto aceito
// ---------------------------------------------------------------------------

function ProdutoRow({
  pa,
  nomeProduto,
  temClausulas,
  onRemover,
  onPatch,
  onEditarClausulas,
}: {
  pa: ProdutoAceito;
  nomeProduto: string;
  temClausulas: boolean;
  onRemover: () => void;
  onPatch: (mut: (p: ProdutoAceito) => ProdutoAceito) => void;
  onEditarClausulas: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const parc = pa.parcelamento ?? { entrada: 0, max_parcelas: 1, valor_parcelado_total: pa.preco_avista };
  const valorParcela =
    parc.max_parcelas > 1
      ? (parc.valor_parcelado_total - (parc.entrada || 0)) / parc.max_parcelas
      : parc.valor_parcelado_total;

  return (
    <div style={{ ...estilos.prodRow, ...(aberto ? estilos.prodRowAberto : {}) }}>
      {/* Cabeçalho colapsável */}
      <div
        style={estilos.prodCabecalho}
        onClick={() => setAberto((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setAberto((o) => !o)}
        aria-expanded={aberto}
      >
        <span style={{ fontSize: 11, color: "oklch(0.65 0.01 270)", flexShrink: 0 }}>
          {aberto ? "▾" : "▸"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={estilos.prodNome}>{nomeProduto}</div>
          <div style={estilos.prodResumo}>
            <span><strong>{brl(pa.preco_avista)}</strong> à vista</span>
            <span style={{ color: "oklch(0.65 0.01 270)" }}>·</span>
            <span>Até <strong>{parc.max_parcelas}×</strong> de {brl(valorParcela)}</span>
          </div>
        </div>
        {!temClausulas && (
          <span style={estilos.badgeAviso} title="Este produto não tem cláusulas escritas">
            sem cláusulas
          </span>
        )}
        <button
          style={estilos.btnIcone}
          onClick={(e) => { e.stopPropagation(); onRemover(); }}
          title="Remover produto"
          aria-label={`Remover ${nomeProduto}`}
        >
          ✕
        </button>
      </div>

      {/* Corpo expansível */}
      {aberto && (
        <div style={estilos.prodCorpo}>
          <div style={estilos.gridPrecos}>
            <PrecoInput
              label="Preço à vista"
              value={pa.preco_avista}
              onChange={(v) => onPatch((p) => ({ ...p, preco_avista: v }))}
            />
            <PrecoInput
              label="Total parcelado"
              hint="Pode ser maior que o à vista."
              value={parc.valor_parcelado_total}
              onChange={(v) => onPatch((p) => ({ ...p, parcelamento: { ...parc, valor_parcelado_total: v } }))}
            />
            <PrecoInput
              label="Entrada"
              value={parc.entrada}
              onChange={(v) => onPatch((p) => ({ ...p, parcelamento: { ...parc, entrada: v } }))}
            />
            <div>
              <label style={estilos.label}>Máx. de parcelas</label>
              <input
                style={estilos.input}
                type="number"
                min={1}
                max={36}
                value={parc.max_parcelas}
                onChange={(e) =>
                  onPatch((p) => ({
                    ...p,
                    parcelamento: {
                      ...parc,
                      max_parcelas: Math.max(1, Math.min(36, Number(e.target.value) || 1)),
                    },
                  }))
                }
              />
            </div>
          </div>

          {/* Resumo do que o lead vê */}
          <div style={estilos.resumoLead}>
            <span style={{ fontSize: 11 }}>✓</span>
            <span>
              Lead vê: <strong>{brl(pa.preco_avista)}</strong> à vista{" "}
              <em>ou</em>{" "}
              {parc.entrada > 0 && <>entrada <strong>{brl(parc.entrada)}</strong> + </>}
              até <strong>{parc.max_parcelas}×</strong> de{" "}
              <strong>{brl(valorParcela)}</strong>
            </span>
          </div>

          <button style={estilos.btnSecundario} onClick={onEditarClausulas}>
            ✏ {temClausulas ? "Editar cláusulas deste produto" : "Escrever cláusulas deste produto"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function PainelPreco({ template, onPatch, onEditarClausulas, produtosDisponiveis }: PainelPrecoProps) {
  const aceitos = template.produtos_aceitos ?? [];
  const aceitosIds = new Set(aceitos.map((p) => p.produto_id));
  const disponiveis = produtosDisponiveis.filter((p) => !aceitosIds.has(p.id));

  function adicionarProduto(produto_id: string) {
    onPatch({
      produtos_aceitos: [
        ...aceitos,
        {
          produto_id,
          preco_avista: 0,
          parcelamento: { entrada: 0, max_parcelas: 1, valor_parcelado_total: 0 },
        },
      ],
    });
  }

  function removerProduto(produto_id: string) {
    onPatch({ produtos_aceitos: aceitos.filter((p) => p.produto_id !== produto_id) });
  }

  function patchProduto(produto_id: string, mut: (p: ProdutoAceito) => ProdutoAceito) {
    onPatch({
      produtos_aceitos: aceitos.map((p) => (p.produto_id === produto_id ? mut(p) : p)),
    });
  }

  return (
    <div style={estilos.container}>
      <h3 style={estilos.titulo}>Produtos aceitos por este template</h3>
      <p style={estilos.subtitulo}>
        <strong>Um template comporta vários produtos.</strong> Liste todos que o agente pode vender
        com este molde — o sistema soma preços e injeta cláusulas por produto automaticamente.
      </p>

      {aceitos.length === 0 && (
        <div style={estilos.vazio}>Nenhum produto adicionado. Use o seletor abaixo.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {aceitos.map((pa) => {
          const prod = produtosDisponiveis.find((p) => p.id === pa.produto_id);
          const nome = prod?.nome ?? `Produto ${pa.produto_id.slice(0, 6)}`;
          const temClausulas = !!(
            template.clausulas_por_produto &&
            template.clausulas_por_produto[pa.produto_id]?.length
          );
          return (
            <ProdutoRow
              key={pa.produto_id}
              pa={pa}
              nomeProduto={nome}
              temClausulas={temClausulas}
              onRemover={() => removerProduto(pa.produto_id)}
              onPatch={(mut) => patchProduto(pa.produto_id, mut)}
              onEditarClausulas={() => onEditarClausulas(pa.produto_id)}
            />
          );
        })}
      </div>

      {disponiveis.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <label style={estilos.label}>Adicionar produto</label>
          <select
            style={estilos.select}
            value=""
            onChange={(e) => { if (e.target.value) adicionarProduto(e.target.value); }}
            aria-label="Selecione um produto para adicionar"
          >
            <option value="">— escolha um produto —</option>
            {disponiveis.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
      )}

      {disponiveis.length === 0 && aceitos.length > 0 && (
        <p style={{ ...estilos.hint, marginTop: 10 }}>
          Todos os produtos do tenant já estão neste template.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const estilos = {
  container: { padding: "16px 14px" } as React.CSSProperties,
  titulo: { margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "oklch(0.97 0.005 270)" } as React.CSSProperties,
  subtitulo: { margin: "0 0 12px", fontSize: 11.5, color: "oklch(0.65 0.01 270)", lineHeight: 1.5 } as React.CSSProperties,
  vazio: {
    padding: 20, textAlign: "center" as const, color: "oklch(0.55 0.01 270)", fontSize: 12,
    background: "oklch(0.20 0.02 275)", border: "1px dashed oklch(1 0 0 / 0.10)", borderRadius: 10,
  } as React.CSSProperties,
  prodRow: {
    background: "oklch(0.20 0.02 275)", border: "1px solid oklch(1 0 0 / 0.08)",
    borderRadius: 10, overflow: "hidden",
  } as React.CSSProperties,
  prodRowAberto: {
    border: "1px solid oklch(0.72 0.18 295 / 0.30)",
  } as React.CSSProperties,
  prodCabecalho: {
    display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
    cursor: "pointer", userSelect: "none" as const,
  } as React.CSSProperties,
  prodNome: { fontSize: 13, fontWeight: 600, color: "oklch(0.97 0.005 270)" } as React.CSSProperties,
  prodResumo: { display: "flex", gap: 6, fontSize: 11, color: "oklch(0.75 0.01 270)", marginTop: 2 } as React.CSSProperties,
  prodCorpo: { padding: "0 12px 12px", display: "flex", flexDirection: "column" as const, gap: 10 } as React.CSSProperties,
  gridPrecos: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } as React.CSSProperties,
  label: { display: "block", fontSize: 11, fontWeight: 600, color: "oklch(0.70 0.01 270)", marginBottom: 4 } as React.CSSProperties,
  input: {
    width: "100%", boxSizing: "border-box" as const, padding: "7px 10px", fontSize: 13,
    background: "oklch(0.16 0.02 275)", border: "1px solid oklch(1 0 0 / 0.10)",
    borderRadius: 8, color: "oklch(0.97 0.005 270)", outline: "none",
  } as React.CSSProperties,
  prefixoBrl: { position: "absolute" as const, left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "oklch(0.55 0.01 270)" } as React.CSSProperties,
  select: {
    width: "100%", padding: "7px 10px", fontSize: 13,
    background: "oklch(0.16 0.02 275)", border: "1px solid oklch(1 0 0 / 0.10)",
    borderRadius: 8, color: "oklch(0.97 0.005 270)", outline: "none", cursor: "pointer",
  } as React.CSSProperties,
  hint: { fontSize: 10.5, color: "oklch(0.55 0.01 270)", marginTop: 4 } as React.CSSProperties,
  resumoLead: {
    display: "flex", gap: 6, alignItems: "center", fontSize: 11, padding: "8px 10px",
    background: "oklch(0.22 0.06 150 / 0.25)", color: "oklch(0.75 0.12 150)",
    border: "1px solid oklch(0.74 0.16 150 / 0.25)", borderRadius: 8, lineHeight: 1.5,
  } as React.CSSProperties,
  btnSecundario: {
    display: "flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center",
    padding: "8px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
    background: "oklch(0.72 0.18 295 / 0.10)", border: "1px solid oklch(0.72 0.18 295 / 0.30)",
    borderRadius: 8, color: "oklch(0.85 0.10 295)",
  } as React.CSSProperties,
  badgeAviso: {
    fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const,
    padding: "2px 7px", borderRadius: 999, background: "oklch(0.80 0.16 55 / 0.15)",
    color: "oklch(0.80 0.16 55)", border: "1px solid oklch(0.80 0.16 55 / 0.30)",
  } as React.CSSProperties,
  btnIcone: {
    background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px",
    fontSize: 11, color: "oklch(0.55 0.01 270)", borderRadius: 6,
  } as React.CSSProperties,
};
