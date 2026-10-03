/**
 * PainelPagamento — modo de cobrança + PIX/link + ordem da jornada do lead.
 *
 * Três seções:
 *   1. Modo: único (recomendado) ou por produto
 *   2. Como receber: chave PIX, link externo, posição do comprovante
 *   3. Ordem dos passos: ↑↓ reordenável; inativos em cinza com microcopy
 */

import type { TemplateV2, PassoJornada, PagamentoConfig } from "../tipos";
import { stepAtivo, passoNumero, instrucaoSelfieLabel, ORDEM_JORNADA_PADRAO } from "./logica";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PainelPagamentoProps {
  template: TemplateV2;
  onPatch: (parcial: Partial<TemplateV2>) => void;
}

// ---------------------------------------------------------------------------
// Sub-componente: card de modo de pagamento
// ---------------------------------------------------------------------------

function ModoCard({
  ativo,
  titulo,
  descricao,
  onClick,
}: {
  ativo: boolean;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <div
      role="radio"
      aria-checked={ativo}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{
        ...estilos.modoCard,
        ...(ativo ? estilos.modoCardAtivo : {}),
      }}
    >
      <div
        style={{
          ...estilos.radioCircle,
          ...(ativo ? estilos.radioCircleAtivo : {}),
        }}
      />
      <div>
        <div style={estilos.modoTitulo}>{titulo}</div>
        <div style={estilos.modoDesc}>{descricao}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Microcopy dos passos inativos
// ---------------------------------------------------------------------------

function microcopySemConfig(step: PassoJornada): string {
  switch (step) {
    case "pagamento":    return "configure preço em algum produto";
    case "comprovante":  return "preencha chave PIX ou link de parcelamento";
    case "selfie":       return "ligue na aba Provas";
    case "documento":    return "ligue na aba Provas";
    case "assinatura":   return "ligue na aba Provas";
    case "testemunha":   return "ligue na aba Provas";
    default:             return "";
  }
}

// ---------------------------------------------------------------------------
// Catálogo de passos — nome e ícone (texto) por chave
// ---------------------------------------------------------------------------

const CATALOG: Record<PassoJornada, { nome: string; icone: string }> = {
  dados:       { nome: "Preencher dados",      icone: "👤" },
  pagamento:   { nome: "Escolher pagamento",   icone: "💰" },
  contrato:    { nome: "Ler contrato",          icone: "📄" },
  comprovante: { nome: "Enviar comprovante",   icone: "💳" },
  selfie:      { nome: "Selfie ao vivo",        icone: "📷" },
  documento:   { nome: "Foto do documento",    icone: "🪪" },
  assinatura:  { nome: "Assinatura no canvas", icone: "✍️" },
  testemunha:  { nome: "Testemunha(s)",        icone: "👥" },
};

function descStep(step: PassoJornada, template: TemplateV2): string {
  const pagto = template.pagamento;
  const provas = template.provas;
  switch (step) {
    case "dados":        return `${(template.campos_cliente ?? []).length} campo(s)`;
    case "pagamento":    return pagto?.modo === "por_produto" ? "por produto" : "único";
    case "contrato":     return "com forma de pagamento já escolhida";
    case "comprovante":  return pagto?.chave_pix ? `PIX ${pagto.chave_pix.slice(0, 12)}…` : "link externo";
    case "selfie":       return instrucaoSelfieLabel(provas?.instrucao_selfie ?? "");
    case "documento":    return "";
    case "assinatura":   return "";
    case "testemunha":   return `${provas?.num_testemunhas || 1}× nome + CPF`;
    default:             return "";
  }
}

// ---------------------------------------------------------------------------
// Sub-componente: linha de passo da jornada
// ---------------------------------------------------------------------------

function PassoRow({
  step,
  template,
  numero,
  isFirst,
  isLast,
  onUp,
  onDown,
}: {
  step: PassoJornada;
  template: TemplateV2;
  numero: number;
  isFirst: boolean;
  isLast: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const ativo = numero > 0;
  const info = CATALOG[step];
  const desc = ativo ? descStep(step, template) : microcopySemConfig(step);

  return (
    <div style={{ ...estilos.passoRow, opacity: ativo ? 1 : 0.42 }}>
      <span
        style={{
          ...estilos.passoNum,
          background: ativo ? "oklch(0.72 0.18 295)" : "oklch(0.22 0.02 275)",
          color: ativo ? "oklch(0.99 0 0)" : "oklch(0.55 0.01 270)",
        }}
        aria-label={ativo ? `Passo ${numero}` : "Inativo"}
      >
        {ativo ? numero : "—"}
      </span>
      <span style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true">{info.icone}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={estilos.passoNome}>{info.nome}</div>
        {desc && <div style={estilos.passoDesc}>{desc}</div>}
      </div>
      <button
        style={{ ...estilos.btnIcone, opacity: isFirst ? 0.3 : 1 }}
        onClick={onUp}
        disabled={isFirst}
        title="Mover para cima"
        aria-label={`Mover ${info.nome} para cima`}
      >
        ▲
      </button>
      <button
        style={{ ...estilos.btnIcone, opacity: isLast ? 0.3 : 1 }}
        onClick={onDown}
        disabled={isLast}
        title="Mover para baixo"
        aria-label={`Mover ${info.nome} para baixo`}
      >
        ▼
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function PainelPagamento({ template, onPatch }: PainelPagamentoProps) {
  const pagto: PagamentoConfig = template.pagamento ?? {
    modo: "unico",
    chave_pix: null,
    link_parcelamento: null,
    posicao_pagamento: null,
  };

  const ordem: PassoJornada[] = template.jornada_ordem ?? ORDEM_JORNADA_PADRAO;

  function patchPagto(k: keyof PagamentoConfig, v: PagamentoConfig[keyof PagamentoConfig]) {
    onPatch({ pagamento: { ...pagto, [k]: v } });
  }

  function moverStep(idx: number, dir: -1 | 1) {
    const dest = idx + dir;
    if (dest < 0 || dest >= ordem.length) return;
    const nova = ordem.slice() as PassoJornada[];
    [nova[idx], nova[dest]] = [nova[dest], nova[idx]];
    onPatch({ jornada_ordem: nova });
  }

  return (
    <div style={estilos.container}>
      {/* ── Seção 1: Modo ── */}
      <h3 style={estilos.titulo}>Forma de cobrança da venda</h3>
      <p style={estilos.subtitulo}>
        Como o lead paga quando compra mais de um produto na mesma venda.
      </p>
      <div style={{ display: "grid", gap: 6, marginBottom: 20 }} role="radiogroup" aria-label="Modo de pagamento">
        <ModoCard
          ativo={pagto.modo === "unico"}
          titulo="Pagamento único (recomendado)"
          descricao="O lead escolhe UMA forma (à vista OU parcelado) e paga o total somado de todos os produtos."
          onClick={() => patchPagto("modo", "unico")}
        />
        <ModoCard
          ativo={pagto.modo === "por_produto"}
          titulo="Pagamento por produto"
          descricao="O lead escolhe forma independente pra cada produto — mais flexível, mais complexo."
          onClick={() => patchPagto("modo", "por_produto")}
        />
      </div>

      {/* ── Seção 2: Como receber ── */}
      <div style={estilos.secao}>
        <h3 style={estilos.titulo}>Como receber (opcional)</h3>
        <p style={estilos.subtitulo}>
          Preenchendo chave PIX ou link de parcelamento, a página pública pede o{" "}
          <strong>comprovante</strong> ao contato.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={estilos.label} htmlFor="chave-pix">Chave PIX</label>
            <input
              id="chave-pix"
              style={estilos.input}
              type="text"
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              value={pagto.chave_pix ?? ""}
              onChange={(e) => patchPagto("chave_pix", e.target.value || null)}
            />
          </div>
          <div>
            <label style={estilos.label} htmlFor="link-parc">Link de parcelamento (externo)</label>
            <input
              id="link-parc"
              style={estilos.input}
              type="url"
              placeholder="https://..."
              value={pagto.link_parcelamento ?? ""}
              onChange={(e) => patchPagto("link_parcelamento", e.target.value || null)}
            />
          </div>
          <div>
            <label style={estilos.label} htmlFor="posicao-pag">Quando pedir o comprovante</label>
            <select
              id="posicao-pag"
              style={estilos.select}
              value={pagto.posicao_pagamento ?? ""}
              onChange={(e) =>
                patchPagto("posicao_pagamento", (e.target.value || null) as PagamentoConfig["posicao_pagamento"])
              }
            >
              <option value="">Não solicitar comprovante</option>
              <option value="before_sign">Antes da assinatura</option>
              <option value="after_sign">Após a assinatura</option>
            </select>
            <div style={estilos.hint}>
              Vira um passo na jornada do lead. Reordene abaixo.
            </div>
          </div>
        </div>
      </div>

      {/* ── Seção 3: Ordem da jornada ── */}
      <div style={estilos.secao}>
        <h3 style={estilos.titulo}>Ordem dos passos do lead</h3>
        <p style={estilos.subtitulo}>
          Sequência que o lead percorre na página pública. Use as setas para reordenar.{" "}
          Passos em cinza não aparecem — faltou configuração; o microcopy indica o quê.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {ordem.map((step, idx) => (
            <PassoRow
              key={step}
              step={step}
              template={template}
              numero={passoNumero(step, ordem, template)}
              isFirst={idx === 0}
              isLast={idx === ordem.length - 1}
              onUp={() => moverStep(idx, -1)}
              onDown={() => moverStep(idx, 1)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const estilos = {
  container: { padding: "16px 14px" } as React.CSSProperties,
  secao: { paddingTop: 16, borderTop: "1px solid oklch(1 0 0 / 0.07)", marginBottom: 4 } as React.CSSProperties,
  titulo: { margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "oklch(0.97 0.005 270)" } as React.CSSProperties,
  subtitulo: { margin: "0 0 10px", fontSize: 11.5, color: "oklch(0.65 0.01 270)", lineHeight: 1.5 } as React.CSSProperties,
  label: { display: "block", fontSize: 11, fontWeight: 600, color: "oklch(0.65 0.01 270)", marginBottom: 4 } as React.CSSProperties,
  input: {
    width: "100%", boxSizing: "border-box" as const, padding: "7px 10px", fontSize: 13,
    background: "oklch(0.16 0.02 275)", border: "1px solid oklch(1 0 0 / 0.10)",
    borderRadius: 8, color: "oklch(0.97 0.005 270)", outline: "none",
  } as React.CSSProperties,
  select: {
    width: "100%", padding: "7px 10px", fontSize: 13,
    background: "oklch(0.16 0.02 275)", border: "1px solid oklch(1 0 0 / 0.10)",
    borderRadius: 8, color: "oklch(0.97 0.005 270)", outline: "none", cursor: "pointer",
  } as React.CSSProperties,
  hint: { fontSize: 10.5, color: "oklch(0.55 0.01 270)", marginTop: 4 } as React.CSSProperties,
  modoCard: {
    display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px",
    borderRadius: 10, cursor: "pointer", userSelect: "none" as const,
    background: "oklch(0.20 0.02 275)", border: "1px solid oklch(1 0 0 / 0.08)",
    transition: "background 120ms ease, border-color 120ms ease",
  } as React.CSSProperties,
  modoCardAtivo: {
    background: "oklch(0.72 0.18 295 / 0.10)", border: "1px solid oklch(0.72 0.18 295 / 0.45)",
  } as React.CSSProperties,
  radioCircle: {
    width: 16, height: 16, borderRadius: "50%", marginTop: 2, flexShrink: 0,
    border: "2px solid oklch(0.45 0.02 270)", background: "oklch(0.18 0.02 275)",
    transition: "border-color 120ms ease",
  } as React.CSSProperties,
  radioCircleAtivo: {
    border: "5px solid oklch(0.72 0.18 295)",
  } as React.CSSProperties,
  modoTitulo: { fontSize: 12.5, fontWeight: 600, color: "oklch(0.97 0.005 270)" } as React.CSSProperties,
  modoDesc: { fontSize: 11, color: "oklch(0.65 0.01 270)", marginTop: 2, lineHeight: 1.45 } as React.CSSProperties,
  passoRow: {
    display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8,
    background: "oklch(0.20 0.02 275)", border: "1px solid oklch(1 0 0 / 0.07)",
    transition: "opacity 150ms ease",
  } as React.CSSProperties,
  passoNum: {
    fontSize: 11, fontWeight: 700, width: 20, height: 20, borderRadius: 999, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
  } as React.CSSProperties,
  passoNome: { fontSize: 12, fontWeight: 600, color: "oklch(0.90 0.005 270)" } as React.CSSProperties,
  passoDesc: { fontSize: 10.5, color: "oklch(0.55 0.01 270)", marginTop: 1 } as React.CSSProperties,
  btnIcone: {
    background: "transparent", border: "none", cursor: "pointer", padding: "3px 5px",
    fontSize: 10, color: "oklch(0.55 0.01 270)", borderRadius: 4, flexShrink: 0,
  } as React.CSSProperties,
};
