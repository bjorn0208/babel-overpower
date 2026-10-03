/**
 * Produto em foco do Chat Treino: tela de início (antes da 1ª mensagem) e seletor compacto
 * do topo (troca no meio da conversa). `null` = conversa geral, sem produto específico.
 */

import type { ProdutoTreino } from "./treino-dados";

export function SeletorProdutoTopo({
  produtos,
  valor,
  onTrocar,
  desabilitado,
}: {
  produtos: ProdutoTreino[];
  valor: string | null;
  onTrocar: (id: string | null) => void;
  desabilitado?: boolean;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, minWidth: 0 }}>
      <span className="muted">Produto</span>
      <select
        value={valor ?? ""}
        disabled={desabilitado}
        onChange={(e) => onTrocar(e.target.value || null)}
        aria-label="Produto em foco da conversa"
        style={{
          maxWidth: 220,
          padding: "5px 8px",
          borderRadius: 8,
          border: "1px solid oklch(0.72 0.2 145 / 0.4)",
          background: "rgba(255,255,255,0.05)",
          color: "var(--txt-1)",
          fontSize: 12,
        }}
      >
        <option value="">Geral (sem produto)</option>
        {produtos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TelaEscolherProduto({
  produtos,
  carregando,
  onEscolher,
}: {
  produtos: ProdutoTreino[];
  carregando: boolean;
  onEscolher: (id: string | null) => void;
}) {
  const cartao = {
    textAlign: "left" as const,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--txt-1)",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  };
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "var(--os-janela-fundo, rgba(18, 14, 34, 0.96))",
      }}
    >
      <div style={{ width: "min(520px, 100%)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 22 }}>🎯</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Sobre qual produto é este treino?</div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          A conversa fica focada nele: no <b>Analisar</b>, ela vira a conversa padrão desse produto, e a agente passa a usá-la
          sempre que o assunto for esse. Se no meio você (o lead) mudar de produto, a ficha troca junto.
        </div>
        {carregando ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Carregando produtos…
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {produtos.map((p) => (
              <button key={p.id} type="button" onClick={() => onEscolher(p.id)} style={cartao}>
                {p.nome}
              </button>
            ))}
            <button type="button" onClick={() => onEscolher(null)} style={{ ...cartao, fontWeight: 500, opacity: 0.8 }}>
              Geral — sem produto específico
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
