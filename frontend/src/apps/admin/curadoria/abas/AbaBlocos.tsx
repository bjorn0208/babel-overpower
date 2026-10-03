/**
 * AbaBlocos — navegador das 14 gavetas de bloco.
 * Banco real via useBlocosGaveta. Filtros: escopo global/nicho/tenant.
 * Editor lateral com CRUD real — extraído em editor-bloco.tsx.
 */

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useBlocosGaveta, useContagensGavetas } from "../dados/use-blocos-gaveta";
import { EditorBloco } from "./editor-bloco";
import type { BlocoBase, EscopoCuradoria, GavetaBloco } from "../dados/tipos";

// ─── mapa de gavetas ─────────────────────────────────────────────────────────

interface DefGaveta {
  tabela: GavetaBloco;
  label: string;
  icone: string;
}

const GAVETAS: DefGaveta[] = [
  { tabela: "blocos_conhecimento",        label: "Conhecimento",        icone: "bookOpen" },
  { tabela: "blocos_comportamento",       label: "Comportamento",       icone: "brain" },
  { tabela: "diretriz_bolha_blocos",      label: "Diretriz bolha",      icone: "message" },
  { tabela: "blocos_meta",                label: "Meta",                icone: "target" },
  { tabela: "blocos_gatilho",             label: "Gatilhos",            icone: "zap" },
  { tabela: "regras_operacionais_blocos", label: "Regras operacionais", icone: "shield" },
  { tabela: "blocos_procedurais",         label: "Procedurais",         icone: "layers" },
  { tabela: "blocos_humanizacao",         label: "Humanização",         icone: "heart" },
  { tabela: "blocos_variacao",            label: "Variação",            icone: "shuffle" },
  { tabela: "anti_padroes",              label: "Anti-padrões",        icone: "ban" },
  { tabela: "emocao_blocos",             label: "Emoção",              icone: "smile" },
  { tabela: "prova_social_blocos",       label: "Prova social",        icone: "users" },
  { tabela: "manipulacao_blocos",        label: "Manipulação",         icone: "wand" },
  { tabela: "acao_pausa_blocos",         label: "Ação / pausa",        icone: "pause" },
];

type EscopoFiltro = "todos" | EscopoCuradoria;

const BADGE_EMBEDDING: Record<string, string> = {
  pronto: "badge-success",
  pendente: "badge-warn",
  falhou: "badge-err",
};

// ─── AbaBlocos ────────────────────────────────────────────────────────────────

export function AbaBlocos() {
  const [gaveta, setGaveta] = useState<GavetaBloco>("blocos_conhecimento");
  const [escopo, setEscopo] = useState<EscopoFiltro>("todos");
  const [busca, setBusca] = useState("");
  const [blocoSel, setBlocoSel] = useState<BlocoBase | null>(null);
  const [criando, setCriando] = useState(false);

  const { status, blocos, total, erro, refetch, salvar, criar, excluir } =
    useBlocosGaveta(gaveta, escopo, busca);
  const contagens = useContagensGavetas(GAVETAS.map((g) => g.tabela));

  const handleNovoBloco = async () => {
    setCriando(true);
    await criar({
      conteudo: "(novo bloco — edite o conteúdo)",
      escopo: escopo === "todos" ? "global" : escopo,
    });
    setCriando(false);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Sidebar gavetas */}
      <div style={{ width: 210, borderRight: "1px solid rgba(255,255,255,0.06)", overflowY: "auto", background: "rgba(255,255,255,0.015)", flexShrink: 0 }}>
        <div className="muted tiny" style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          14 gavetas
        </div>
        {GAVETAS.map((g) => {
          const ativa = gaveta === g.tabela;
          return (
            <button
              key={g.tabela}
              onClick={() => { setGaveta(g.tabela); setBlocoSel(null); }}
              style={{ width: "100%", textAlign: "left", padding: "9px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: ativa ? "rgba(255,255,255,0.07)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >
              <Icon name={g.icone} size={13} style={{ color: ativa ? "oklch(0.72 0.18 145)" : "var(--txt-3)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: ativa ? "inherit" : "var(--txt-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</div>
                <div className="mono muted tiny" style={{ fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.tabela}</div>
              </div>
              <span
                className="mono tiny"
                style={{
                  flexShrink: 0,
                  fontVariantNumeric: "tabular-nums",
                  color: (contagens[g.tabela] ?? 0) > 0 ? "var(--txt-2)" : "var(--txt-3)",
                  opacity: (contagens[g.tabela] ?? 0) > 0 ? 1 : 0.5,
                }}
              >
                {contagens[g.tabela] ?? "…"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Lista blocos */}
      <div style={{ flex: blocoSel ? "0 0 50%" : "1", display: "flex", flexDirection: "column", borderRight: blocoSel ? "1px solid rgba(255,255,255,0.06)" : "none", overflow: "hidden", minWidth: 0 }}>
        {/* Barra filtros */}
        <div className="row gap-2" style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, flexWrap: "wrap" }}>
          <div className="row gap-2 os-card" style={{ padding: "5px 8px", flex: 1, minWidth: 140 }}>
            <Icon name="search" size={12} />
            <input
              className="input"
              style={{ border: "none", background: "transparent", flex: 1, fontSize: 12, height: 20 }}
              placeholder="buscar no conteúdo…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="row" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, overflow: "hidden" }}>
            {(["todos", "global", "nicho", "tenant"] as EscopoFiltro[]).map((e) => (
              <button
                key={e}
                onClick={() => setEscopo(e)}
                style={{ padding: "4px 10px", fontSize: 11, fontFamily: "monospace", background: escopo === e ? "rgba(255,255,255,0.1)" : "transparent", color: escopo === e ? "inherit" : "var(--txt-3)", cursor: "pointer", border: "none" }}
              >
                {e}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleNovoBloco} disabled={criando}>
            <Icon name="plus" size={12} />
            {criando ? "criando…" : "novo bloco"}
          </button>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {status === "carregando" && (
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ height: 56, background: "rgba(255,255,255,0.03)", borderRadius: 6, animation: "pulse 1.5s ease-in-out infinite" }} />
              ))}
            </div>
          )}

          {status === "erro" && (
            <div style={{ padding: 16 }}>
              <div className="os-card" style={{ padding: 12, background: "oklch(0.65 0.24 25 / 0.08)", border: "1px solid oklch(0.65 0.24 25 / 0.3)" }}>
                <div className="row gap-2">
                  <Icon name="alert" size={13} />
                  <span className="small" style={{ flex: 1, color: "oklch(0.82 0.20 25)" }}>{erro}</span>
                  <button className="btn btn-ghost btn-sm" onClick={refetch}><Icon name="refresh" size={12} /></button>
                </div>
              </div>
            </div>
          )}

          {status === "ok" && blocos.length === 0 && (
            <div style={{ padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Icon name="bookOpen" size={22} />
              <div className="h3 muted">Nenhum bloco</div>
              <div className="muted small" style={{ textAlign: "center" }}>Mude o filtro de escopo ou crie o primeiro bloco.</div>
            </div>
          )}

          {status === "ok" && blocos.length > 0 && (
            <div>
              <div className="muted tiny mono" style={{ padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                {total} total · mostrando {blocos.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {blocos.map((b) => {
                  const sel = blocoSel?.id === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setBlocoSel(b)}
                      style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: sel ? "rgba(255,255,255,0.06)" : "transparent", opacity: b.ativo ? 1 : 0.55, cursor: "pointer" }}
                    >
                      <div style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {b.conteudo}
                      </div>
                      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                        <span className={`badge ${b.escopo === "global" ? "badge-info" : b.escopo === "nicho" ? "badge-aurora" : "badge"}`} style={{ fontSize: 9 }}>{b.escopo}</span>
                        <span className={`badge ${BADGE_EMBEDDING[b.embedding_status] ?? "badge"}`} style={{ fontSize: 9 }}>{b.embedding_status}</span>
                        {!b.ativo && <span className="badge" style={{ fontSize: 9 }}>INATIVO</span>}
                        <span className="mono muted tiny">{b.id.slice(0, 8)}</span>
                        <span className="muted tiny mono" style={{ marginLeft: "auto" }}>{new Date(b.atualizado_em).toLocaleDateString("pt-BR")}</span>
                      </div>
                      {b.tags && b.tags.length > 0 && (
                        <div className="row gap-1" style={{ marginTop: 4, flexWrap: "wrap" }}>
                          {b.tags.slice(0, 3).map((t) => <span key={t} className="mono muted tiny">#{t}</span>)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor lateral */}
      {blocoSel && (
        <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
          {/* key={blocoSel.id}: remonta o editor ao trocar de bloco. Sem isso o
              estado interno (rascunho do conteúdo) persistia do bloco anterior —
              clicar A, depois B e salvar gravava o texto de A por cima de B. */}
          <EditorBloco
            key={blocoSel.id}
            bloco={blocoSel}
            gaveta={gaveta}
            onFechar={() => setBlocoSel(null)}
            onSalvar={async (id, patch) => {
              await salvar(id, patch);
              setBlocoSel((prev) => prev ? { ...prev, ...patch } : null);
            }}
            onExcluir={excluir}
          />
        </div>
      )}
    </div>
  );
}
