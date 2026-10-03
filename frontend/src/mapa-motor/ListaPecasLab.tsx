// Lista de peças do ragentic-lab com busca, filtro e badge de cobertura
// Fase C3 — Mapa do Motor Vivo

import { useState, useMemo } from "react";
import { INVENTARIO_LAB, SECAO_LABELS } from "./inventario-lab";
import type { PecaLab, CoberturaMotor, SecaoLab } from "./tipos-lab";

interface PropsListaPecasLab {
  /** Peça selecionada atualmente (para destacar) */
  pecaSelecionada: string | null;
  /** Callback ao selecionar uma peça */
  aoSelecionarPeca: (peca: PecaLab | null) => void;
}

// ─── Cores de cobertura ───────────────────────────────────────────────────────

const COR_COBERTURA: Record<CoberturaMotor, string> = {
  tem: "oklch(0.60 0.16 145)",
  parcial: "oklch(0.70 0.18 60)",
  falta: "oklch(0.60 0.20 20)",
  "?": "oklch(0.50 0.05 240)",
};

const LABEL_COBERTURA: Record<CoberturaMotor, string> = {
  tem: "tem",
  parcial: "parcial",
  falta: "falta",
  "?": "?",
};

const TOOLTIP_COBERTURA =
  "Cruzamento heurístico por nome/conceito vs motor de hoje — confirme manualmente";

// ─── Componente badge de cobertura ────────────────────────────────────────────

function BadgeCobertura({ cobertura }: { cobertura: CoberturaMotor }) {
  return (
    <span
      title={TOOLTIP_COBERTURA}
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: `${COR_COBERTURA[cobertura]}22`,
        color: COR_COBERTURA[cobertura],
        border: `1px solid ${COR_COBERTURA[cobertura]}55`,
        flexShrink: 0,
      }}
    >
      {LABEL_COBERTURA[cobertura]}
    </span>
  );
}

// ─── Filtros disponíveis ──────────────────────────────────────────────────────

type FiltroCob = "todos" | CoberturaMotor;

const FILTROS_COB: { valor: FiltroCob; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "falta", label: "Falta" },
  { valor: "parcial", label: "Parcial" },
  { valor: "tem", label: "Tem" },
  { valor: "?", label: "?" },
];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ListaPecasLab({
  pecaSelecionada,
  aoSelecionarPeca,
}: PropsListaPecasLab) {
  const [busca, setBusca] = useState("");
  const [filtroCob, setFiltroCob] = useState<FiltroCob>("todos");
  const [filtroSecao, setFiltroSecao] = useState<SecaoLab | "todas">("todas");

  // Seções únicas para o dropdown
  const secoesDisponiveis = useMemo<SecaoLab[]>(() => {
    const set = new Set(INVENTARIO_LAB.map((p) => p.secao));
    return Array.from(set);
  }, []);

  // Filtra e busca
  const pecasFiltradas = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return INVENTARIO_LAB.filter((p) => {
      if (filtroCob !== "todos" && p.cobertura !== filtroCob) return false;
      if (filtroSecao !== "todas" && p.secao !== filtroSecao) return false;
      if (termo) {
        return (
          p.nome.toLowerCase().includes(termo) ||
          p.o_que_faz.toLowerCase().includes(termo) ||
          p.secao.toLowerCase().includes(termo)
        );
      }
      return true;
    });
  }, [busca, filtroCob, filtroSecao]);

  // Conta por cobertura (do total)
  const contagem = useMemo(() => {
    const c: Record<string, number> = { tem: 0, parcial: 0, falta: 0, "?": 0 };
    INVENTARIO_LAB.forEach((p) => c[p.cobertura]++);
    return c;
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Cabeçalho e totais */}
      <div
        style={{
          padding: "12px 14px 8px",
          borderBottom: "1px solid oklch(0.22 0.03 240)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "oklch(0.70 0.04 240)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {INVENTARIO_LAB.length} peças do lab
        </div>
        {/* Totais por cobertura */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {(["tem", "parcial", "falta", "?"] as CoberturaMotor[]).map((c) => (
            <div
              key={c}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 2,
                  background: COR_COBERTURA[c],
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10, color: "oklch(0.60 0.04 240)" }}>
                {LABEL_COBERTURA[c]} {contagem[c]}
              </span>
            </div>
          ))}
        </div>
        {/* Busca */}
        <input
          type="text"
          placeholder="Buscar peça..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{
            width: "100%",
            background: "oklch(0.17 0.02 240)",
            border: "1px solid oklch(0.28 0.03 240)",
            borderRadius: 6,
            color: "oklch(0.90 0.02 240)",
            fontSize: 12,
            padding: "5px 9px",
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 6,
          }}
        />
        {/* Filtros de cobertura */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {FILTROS_COB.map((f) => (
            <button
              key={f.valor}
              onClick={() => setFiltroCob(f.valor)}
              style={{
                background:
                  filtroCob === f.valor
                    ? "oklch(0.30 0.05 240)"
                    : "oklch(0.17 0.02 240)",
                border: `1px solid ${
                  filtroCob === f.valor
                    ? "oklch(0.45 0.08 240)"
                    : "oklch(0.25 0.03 240)"
                }`,
                borderRadius: 5,
                color:
                  filtroCob === f.valor
                    ? "oklch(0.92 0.02 240)"
                    : "oklch(0.55 0.04 240)",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 8px",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Filtro de seção */}
        <select
          value={filtroSecao}
          onChange={(e) =>
            setFiltroSecao(e.target.value as SecaoLab | "todas")
          }
          style={{
            width: "100%",
            background: "oklch(0.17 0.02 240)",
            border: "1px solid oklch(0.28 0.03 240)",
            borderRadius: 6,
            color: "oklch(0.80 0.02 240)",
            fontSize: 11,
            padding: "4px 8px",
            outline: "none",
          }}
        >
          <option value="todas">Todas as seções</option>
          {secoesDisponiveis.map((s) => (
            <option key={s} value={s}>
              {SECAO_LABELS[s] ?? s}
            </option>
          ))}
        </select>
      </div>

      {/* Lista scrollável */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 0",
        }}
      >
        {pecasFiltradas.length === 0 ? (
          <div
            style={{
              padding: "24px 14px",
              textAlign: "center",
              color: "oklch(0.45 0.04 240)",
              fontSize: 12,
            }}
          >
            Nenhuma peça encontrada
          </div>
        ) : (
          pecasFiltradas.map((peca) => {
            const selecionada = peca.id === pecaSelecionada;
            return (
              <button
                key={peca.id}
                onClick={() =>
                  aoSelecionarPeca(selecionada ? null : peca)
                }
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  width: "100%",
                  textAlign: "left",
                  background: selecionada
                    ? "oklch(0.20 0.05 240)"
                    : "transparent",
                  border: "none",
                  borderLeft: `3px solid ${
                    selecionada
                      ? "oklch(0.65 0.18 240)"
                      : "transparent"
                  }`,
                  borderBottom: "1px solid oklch(0.16 0.02 240)",
                  padding: "7px 12px 7px 11px",
                  cursor: "pointer",
                  transition: "background 120ms ease-out",
                }}
                onMouseEnter={(e) => {
                  if (!selecionada)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "oklch(0.16 0.03 240)";
                }}
                onMouseLeave={(e) => {
                  if (!selecionada)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "transparent";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: selecionada
                        ? "oklch(0.95 0.03 240)"
                        : "oklch(0.85 0.02 240)",
                      lineHeight: 1.3,
                    }}
                  >
                    {peca.nome}
                  </span>
                  <BadgeCobertura cobertura={peca.cobertura} />
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "oklch(0.50 0.04 240)",
                    lineHeight: 1.4,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {peca.o_que_faz}
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 9,
                      color: "oklch(0.40 0.04 240)",
                      fontStyle: "italic",
                    }}
                  >
                    {SECAO_LABELS[peca.secao] ?? peca.secao}
                  </span>
                  {peca.maturidade !== "implementada" && (
                    <span
                      style={{
                        fontSize: 9,
                        color: "oklch(0.55 0.10 60)",
                        fontWeight: 600,
                      }}
                    >
                      · {peca.maturidade}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Rodapé com contagem filtrada */}
      <div
        style={{
          padding: "6px 14px",
          borderTop: "1px solid oklch(0.18 0.02 240)",
          fontSize: 10,
          color: "oklch(0.40 0.04 240)",
          flexShrink: 0,
        }}
      >
        {pecasFiltradas.length} de {INVENTARIO_LAB.length} peças
        {" · "}
        <span title={TOOLTIP_COBERTURA} style={{ cursor: "help", borderBottom: "1px dotted oklch(0.40 0.04 240)" }}>
          cobertura = heurística
        </span>
      </div>
    </div>
  );
}
