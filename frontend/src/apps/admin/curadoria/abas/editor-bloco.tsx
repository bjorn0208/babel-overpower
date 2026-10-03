/**
 * EditorBloco — painel lateral de edição de um bloco de conhecimento.
 * Controla conteúdo + escopo com estado local e chama callbacks para
 * salvar/excluir via hook useBlocosGaveta do componente pai (AbaBlocos).
 */

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import type { BlocoBase, GavetaBloco } from "../dados/tipos";

const BADGE_EMBEDDING: Record<string, string> = {
  pronto: "badge-success",
  pendente: "badge-warn",
  falhou: "badge-err",
};

export function EditorBloco({
  bloco,
  gaveta: _gaveta,
  onFechar,
  onSalvar,
  onExcluir,
}: {
  bloco: BlocoBase;
  gaveta: GavetaBloco;
  onFechar: () => void;
  onSalvar: (id: string, patch: Partial<BlocoBase>) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}) {
  const [conteudo, setConteudo] = useState(bloco.conteudo);
  const [escopo, setEscopo] = useState<BlocoBase["escopo"]>(bloco.escopo);
  const [salvando, setSalvando] = useState(false);

  const handleSalvar = async () => {
    setSalvando(true);
    await onSalvar(bloco.id, { conteudo, escopo });
    setSalvando(false);
  };

  const handleExcluir = async () => {
    if (!window.confirm("Excluir este bloco? Esta ação é irreversível via UI.")) return;
    await onExcluir(bloco.id);
    onFechar();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className="row" style={{ justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div className="row gap-2">
          <Icon name="edit" size={13} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            Editor · <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>{bloco.id.slice(0, 8)}</span>
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onFechar}><Icon name="x" size={13} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Conteúdo */}
        <div>
          <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Conteúdo</div>
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            rows={6}
            style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px", fontSize: 12, lineHeight: 1.6, resize: "none", color: "inherit", fontFamily: "inherit" }}
          />
        </div>

        {/* Escopo + status do vetor */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Escopo</div>
            <select
              value={escopo}
              onChange={(e) => setEscopo(e.target.value as BlocoBase["escopo"])}
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "inherit" }}
            >
              <option value="global">global</option>
              <option value="nicho">nicho</option>
              <option value="tenant">tenant</option>
              <option value="produto">produto</option>
            </select>
          </div>
          <div>
            <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Status do vetor</div>
            <span className={`badge ${BADGE_EMBEDDING[bloco.embedding_status] ?? "badge"}`} style={{ fontSize: 11 }}>
              {bloco.embedding_status}
            </span>
          </div>
        </div>

        {/* Ativo */}
        <div className="row gap-2" style={{ fontSize: 12 }}>
          <span className="muted">Ativo:</span>
          <span style={{ color: bloco.ativo ? "oklch(0.72 0.18 145)" : "var(--txt-3)" }}>
            {bloco.ativo ? "sim — incluso no RAG" : "não — soft delete"}
          </span>
        </div>

        {/* Tags */}
        {bloco.tags && bloco.tags.length > 0 && (
          <div>
            <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Tags</div>
            <div className="row gap-1" style={{ flexWrap: "wrap" }}>
              {bloco.tags.map((t) => <span key={t} className="mono muted tiny">#{t}</span>)}
            </div>
          </div>
        )}

        {/* Auditoria */}
        <div>
          <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Auditoria</div>
          <div className="mono muted tiny" style={{ lineHeight: 1.7 }}>
            <div>· atualizado {new Date(bloco.atualizado_em).toLocaleDateString("pt-BR")}</div>
            <div>· criado {new Date(bloco.criado_em).toLocaleDateString("pt-BR")}</div>
          </div>
        </div>
      </div>

      <div className="row gap-2" style={{ justifyContent: "space-between", padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleExcluir}
          style={{ color: "oklch(0.65 0.20 25)" }}
        >
          <Icon name="trash" size={12} />
          excluir
        </button>
        <div className="row gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onFechar}>cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={handleSalvar} disabled={salvando}>
            <Icon name="save" size={12} />
            {salvando ? "salvando…" : "salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
