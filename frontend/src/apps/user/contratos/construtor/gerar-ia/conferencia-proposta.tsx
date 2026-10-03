/**
 * conferencia-proposta.tsx — Tela de conferência da proposta da IA (F3c).
 *
 * Gate humano do blueprint v3: a IA propõe, o tenant carimba. Mostra os 4
 * baldes (produto+campos+exigências+miolo+moldura) editáveis, com a validação
 * placeholder↔campo viva — erro bloqueia o salvar no rodapé do modal.
 */

import React, { useState } from "react";
import { estilosGerarIA as e } from "./estilos-gerar-ia";
import type { PropostaEstrutura, ValidacaoProposta } from "./proposta";

// ---------------------------------------------------------------------------
// Estilos locais (mesma linguagem oklch dark do modal)
// ---------------------------------------------------------------------------

const cx = {
  secao: {
    background: "oklch(0.14 0.01 270)",
    border: "1px solid oklch(0.22 0.01 270)",
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden" as const,
  },
  secaoCabecalho: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 700 as const,
    color: "oklch(0.92 0 0)",
    textAlign: "left" as const,
    minHeight: 44,
  },
  secaoCorpo: { padding: "0 12px 12px" },
  badge: {
    marginLeft: "auto",
    background: "oklch(1 0 0 / 0.10)",
    padding: "1px 8px",
    borderRadius: 99,
    fontSize: 10,
    fontWeight: 600 as const,
    color: "oklch(0.65 0.01 270)",
  },
  alerta: (cor: string) => ({
    border: `1px solid ${cor.replace(")", " / 0.35)")}`,
    background: cor.replace(")", " / 0.10)"),
    color: cor,
    borderRadius: 10,
    padding: "8px 11px",
    fontSize: 11.5,
    lineHeight: 1.45,
    marginBottom: 8,
  }),
  linhaCampo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 8px",
    borderRadius: 8,
    border: "1px solid oklch(0.20 0.01 270)",
    marginBottom: 6,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box" as const,
    background: "oklch(0.11 0.01 270)",
    border: "1px solid oklch(0.24 0.01 270)",
    borderRadius: 10,
    color: "oklch(0.90 0 0)",
    fontSize: 12,
    lineHeight: 1.55,
    padding: "10px 12px",
    fontFamily: "inherit",
    resize: "vertical" as const,
  },
  select: {
    width: "100%",
    minHeight: 40,
    background: "oklch(0.11 0.01 270)",
    border: "1px solid oklch(0.24 0.01 270)",
    borderRadius: 10,
    color: "oklch(0.92 0 0)",
    fontSize: 13,
    padding: "8px 10px",
  },
  toggle: (ativo: boolean) => ({
    minWidth: 44,
    minHeight: 26,
    borderRadius: 99,
    border: "none",
    cursor: "pointer",
    background: ativo ? "oklch(0.74 0.16 150 / 0.9)" : "oklch(0.30 0.01 270)",
    position: "relative" as const,
    transition: "background 160ms ease-out",
    flexShrink: 0,
  }),
  toggleBola: (ativo: boolean) => ({
    position: "absolute" as const,
    top: 3,
    left: ativo ? 22 : 3,
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "oklch(0.97 0 0)",
    transition: "left 180ms cubic-bezier(0.23, 1, 0.32, 1)",
  }),
};

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function Secao({ titulo, badge, aberta, onToggle, children }: {
  titulo: string;
  badge?: string;
  aberta: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={cx.secao}>
      <button type="button" style={cx.secaoCabecalho} onClick={onToggle} aria-expanded={aberta}>
        <span style={{ fontSize: 10, opacity: 0.6, transform: aberta ? "rotate(90deg)" : "none", transition: "transform 160ms ease-out", display: "inline-block" }}>▶</span>
        {titulo}
        {badge && <span style={cx.badge}>{badge}</span>}
      </button>
      {aberta && <div style={cx.secaoCorpo}>{children}</div>}
    </div>
  );
}

function Alternador({ ativo, onMudar, rotulo }: { ativo: boolean; onMudar: (v: boolean) => void; rotulo: string }): React.ReactElement {
  return (
    <button type="button" style={cx.toggle(ativo)} onClick={() => onMudar(!ativo)} aria-pressed={ativo} aria-label={rotulo}>
      <span style={cx.toggleBola(ativo)} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// ConferenciaProposta
// ---------------------------------------------------------------------------

export interface ConferenciaPropostaProps {
  proposta: PropostaEstrutura;
  onMudar: (p: PropostaEstrutura) => void;
  validacao: ValidacaoProposta;
  produtos: Array<{ id: string; nome: string }>;
  produtoId: string;
  onProdutoId: (id: string) => void;
}

export function ConferenciaProposta({
  proposta, onMudar, validacao, produtos, produtoId, onProdutoId,
}: ConferenciaPropostaProps): React.ReactElement {
  const [aberta, setAberta] = useState<Record<string, boolean>>({ campos: true, exigencias: false, miolo: false, moldura: false });
  const alternar = (k: string) => setAberta((prev) => ({ ...prev, [k]: !prev[k] }));

  function mudarCampo(idx: number, parcial: Partial<PropostaEstrutura["campos"][number]>) {
    const campos = proposta.campos.map((c, i) => (i === idx ? { ...c, ...parcial } : c));
    onMudar({ ...proposta, campos });
  }

  function removerCampo(idx: number) {
    onMudar({ ...proposta, campos: proposta.campos.filter((_, i) => i !== idx) });
  }

  const ex = proposta.exigencias;

  return (
    <div>
      {/* Validação viva */}
      {validacao.erros.map((erro, i) => (
        <div key={`e${i}`} style={cx.alerta("oklch(0.70 0.19 25)")} role="alert">✕ {erro}</div>
      ))}
      {validacao.avisos.map((aviso, i) => (
        <div key={`a${i}`} style={cx.alerta("oklch(0.82 0.18 85)")}>⚠ {aviso}</div>
      ))}

      {/* Produto destino */}
      <label style={{ ...e.label, display: "block", marginBottom: 6 }}>
        Este contrato é de qual produto?
        <select
          style={{ ...cx.select, marginTop: 6 }}
          value={produtoId}
          onChange={(ev) => onProdutoId(ev.target.value)}
        >
          <option value="">Escolha o produto…</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      </label>
      {proposta.nome_produto_detectado && (
        <div style={{ fontSize: 11, color: "oklch(0.55 0.01 270)", margin: "2px 0 12px" }}>
          A IA identificou no documento: “{proposta.nome_produto_detectado}”
        </div>
      )}

      {/* Campos do formulário */}
      <Secao titulo="Campos do formulário" badge={`${proposta.campos.length}`} aberta={aberta.campos} onToggle={() => alternar("campos")}>
        {proposta.campos.map((campo, idx) => (
          <div key={campo.slug} style={cx.linhaCampo}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.92 0 0)" }}>{campo.rotulo}</div>
              <div style={{ fontSize: 10.5, color: "oklch(0.52 0.01 270)" }}>
                {"{{"}{campo.slug}{"}}"} · {campo.tipo}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "oklch(0.62 0.01 270)" }}>
              obrigatório
              <Alternador ativo={campo.obrigatorio} onMudar={(v) => mudarCampo(idx, { obrigatorio: v })} rotulo={`Campo ${campo.rotulo} obrigatório`} />
            </label>
            <button type="button" style={{ ...e.btnIcone, minWidth: 32, minHeight: 32 }} onClick={() => removerCampo(idx)} aria-label={`Remover campo ${campo.rotulo}`}>✕</button>
          </div>
        ))}
      </Secao>

      {/* Exigências */}
      <Secao
        titulo="Exigências na assinatura"
        badge={[ex.selfie && "selfie", ex.documento && "documento", ex.assinatura_manuscrita && "canvas", `${ex.num_testemunhas} test.`].filter(Boolean).join(" · ")}
        aberta={aberta.exigencias}
        onToggle={() => alternar("exigencias")}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, color: "oklch(0.85 0 0)" }}>Exigir selfie com documento</span>
          <Alternador ativo={ex.selfie} onMudar={(v) => onMudar({ ...proposta, exigencias: { ...ex, selfie: v } })} rotulo="Exigir selfie" />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, color: "oklch(0.85 0 0)" }}>Exigir foto do documento (RG/CNH)</span>
          <Alternador ativo={ex.documento} onMudar={(v) => onMudar({ ...proposta, exigencias: { ...ex, documento: v } })} rotulo="Exigir foto do documento" />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, color: "oklch(0.85 0 0)" }}>Assinatura desenhada na tela (canvas)</span>
          <Alternador ativo={ex.assinatura_manuscrita} onMudar={(v) => onMudar({ ...proposta, exigencias: { ...ex, assinatura_manuscrita: v } })} rotulo="Exigir assinatura desenhada" />
        </div>
        {ex.selfie && (
          <input
            style={{ ...cx.select, marginBottom: 10 }}
            value={ex.instrucao_selfie}
            onChange={(ev) => onMudar({ ...proposta, exigencias: { ...ex, instrucao_selfie: ev.target.value } })}
            placeholder="Instrução da selfie (ex.: segure seu documento ao lado do rosto)"
            aria-label="Instrução da selfie"
          />
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12.5, color: "oklch(0.85 0 0)" }}>Testemunhas</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onMudar({ ...proposta, exigencias: { ...ex, num_testemunhas: n } })}
                style={{
                  minWidth: 36, minHeight: 32, borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                  border: `1px solid ${ex.num_testemunhas === n ? "oklch(0.72 0.22 295)" : "oklch(0.26 0.01 270)"}`,
                  background: ex.num_testemunhas === n ? "oklch(0.72 0.18 295 / 0.18)" : "oklch(0.16 0.01 270)",
                  color: ex.num_testemunhas === n ? "oklch(0.85 0.12 295)" : "oklch(0.70 0.01 270)",
                }}
                aria-pressed={ex.num_testemunhas === n}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "oklch(0.52 0.01 270)", marginTop: 8, lineHeight: 1.4 }}>
          Em venda conjunta vale sempre a exigência mais rigorosa entre os produtos do carrinho.
        </div>
      </Secao>

      {/* Miolo */}
      <Secao titulo="Cláusulas do produto (miolo)" badge={`${proposta.miolo.length} caracteres`} aberta={aberta.miolo} onToggle={() => alternar("miolo")}>
        <textarea
          style={cx.textarea}
          rows={8}
          value={proposta.miolo}
          onChange={(ev) => onMudar({ ...proposta, miolo: ev.target.value })}
          aria-label="Cláusulas do produto"
        />
      </Secao>

      {/* Moldura */}
      <Secao titulo="Moldura do contrato (substitui o molde ativo)" badge={`${proposta.moldura.length} caracteres`} aberta={aberta.moldura} onToggle={() => alternar("moldura")}>
        <div style={cx.alerta("oklch(0.72 0.16 235)")}>
          Ao salvar, este texto vira o molde ativo do seu contrato. Os {"{{campos}}"} são preenchidos pelo cliente e o token {"{CLAUSULAS_POR_PRODUTO}"} recebe as cláusulas dos produtos vendidos.
        </div>
        <textarea
          style={cx.textarea}
          rows={12}
          value={proposta.moldura}
          onChange={(ev) => onMudar({ ...proposta, moldura: ev.target.value })}
          aria-label="Moldura do contrato"
        />
      </Secao>
    </div>
  );
}
