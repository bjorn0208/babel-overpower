/**
 * painel-lead-steps.tsx — Steps de dados/pagamento/contrato/comprovante (mock visual).
 *
 * Extraído de painel-lead.tsx para manter cada arquivo ≤ 300 linhas.
 * Steps de prova (selfie/assinatura/testemunha) em painel-lead-provas.tsx.
 */

import React, { useState } from "react";

import type { TemplateV2 } from "../tipos";
import { brl, calcularCarrinho } from "./logica";
import { carrinhoExemplo } from "./painel-lead";
import type { ProdutoRef } from "./logica";

// ---------------------------------------------------------------------------
// Produtos de referência mock (2e substitui por fetch do banco)
// ---------------------------------------------------------------------------

/**
 * Δ 2026-09-08 — estes produtos fictícios eram usados no cálculo da jornada e zeravam a
 * tela inteira, porque não batem com `produtos_aceitos` de template nenhum. Ficam só como
 * texto de exemplo onde não há cálculo; o dinheiro agora vem dos produtos reais do tenant.
 */
export const PRODUTOS_MOCK_LEAD = [
  { id: "p-a", nome: "Mentoria 6 meses" },
  { id: "p-b", nome: "Aula avulsa" },
  { id: "p-c", nome: "Pack 10 aulas" },
  { id: "p-d", nome: "Acompanhamento VIP" },
];

// ---------------------------------------------------------------------------
// Estilos compartilhados (exportados para painel-lead-provas.tsx)
// ---------------------------------------------------------------------------

export const estilosStep = {
  cabecalho: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 4,
    color: "oklch(0.15 0.01 270)",
  } as React.CSSProperties,
  subtitulo: {
    fontSize: 11.5,
    color: "oklch(0.45 0.01 270)",
    marginBottom: 12,
    lineHeight: 1.5,
  } as React.CSSProperties,
  btnAvancar: {
    width: "100%",
    marginTop: 14,
    padding: "11px",
    background: "oklch(0.55 0.18 295)",
    color: "oklch(0.99 0 0)",
    border: "none",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  } as React.CSSProperties,
  campo: { marginBottom: 10 } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "oklch(0.35 0.01 270)",
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "9px 11px",
    fontSize: 13,
    border: "1px solid oklch(0.80 0.005 270)",
    borderRadius: 7,
    background: "oklch(1 0 0)",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// StepDados
// ---------------------------------------------------------------------------

export function StepDados({
  template,
  onNext,
}: {
  template: TemplateV2;
  onNext: () => void;
}): React.ReactElement {
  const campos = template.campos_cliente ?? [];
  return (
    <>
      <div style={estilosStep.cabecalho}>Preencha seus dados</div>
      <div style={estilosStep.subtitulo}>
        Vamos preparar seu contrato com o que você comprou.
      </div>
      {campos.length === 0 && (
        <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "oklch(0.5 0.01 270)" }}>
          Nenhum campo configurado ainda.
        </div>
      )}
      {campos.map((c) => (
        <div key={c.slug} style={estilosStep.campo}>
          <label style={estilosStep.label}>
            {c.rotulo}
            {c.obrigatorio && (
              <span style={{ color: "oklch(0.65 0.22 25)", marginLeft: 4 }}>*</span>
            )}
          </label>
          <input
            type="text"
            style={estilosStep.input}
            placeholder={`Digite ${c.rotulo.toLowerCase()}`}
            readOnly
          />
        </div>
      ))}
      <button style={estilosStep.btnAvancar} onClick={onNext}>
        Continuar →
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// StepPagamento
// ---------------------------------------------------------------------------

export function StepPagamento({
  template,
  produtosRef,
  onNext,
}: {
  template: TemplateV2;
  produtosRef: ProdutoRef[];
  onNext: () => void;
}): React.ReactElement {
  const [escolha, setEscolha] = useState<"avista" | "parcelado" | null>(null);
  const calc = calcularCarrinho(template, carrinhoExemplo(template), produtosRef);
  const { totalAvista, totalParcelado, maxParcelas } = calc;

  const estiloOpcao = (ativa: boolean): React.CSSProperties => ({
    padding: "12px 14px",
    border: `1px solid ${ativa ? "oklch(0.55 0.18 295)" : "oklch(0.82 0.005 270)"}`,
    borderRadius: 10,
    marginBottom: 8,
    background: ativa ? "oklch(0.72 0.18 295 / 0.08)" : "oklch(1 0 0)",
    cursor: "pointer",
  });

  return (
    <>
      <div style={estilosStep.cabecalho}>Como você quer pagar?</div>
      <div style={estilosStep.subtitulo}>Escolha à vista ou parcelado.</div>
      <div onClick={() => setEscolha("avista")} style={estiloOpcao(escolha === "avista")}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>À vista</div>
        <div style={{ fontSize: 12, color: "oklch(0.40 0.01 270)", marginTop: 2 }}>
          {brl(totalAvista)} via PIX
        </div>
      </div>
      <div onClick={() => setEscolha("parcelado")} style={estiloOpcao(escolha === "parcelado")}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Parcelado</div>
        <div style={{ fontSize: 12, color: "oklch(0.40 0.01 270)", marginTop: 2 }}>
          Total {brl(totalParcelado)} — até {maxParcelas}×
        </div>
      </div>
      <button
        style={{
          ...estilosStep.btnAvancar,
          background: escolha ? "oklch(0.55 0.18 295)" : "oklch(0.85 0.005 270)",
          color: escolha ? "oklch(0.99 0 0)" : "oklch(0.55 0.01 270)",
          cursor: escolha ? "pointer" : "not-allowed",
        }}
        onClick={onNext}
        disabled={!escolha}
      >
        {escolha ? "Continuar →" : "Escolha uma opção"}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// StepContrato
// ---------------------------------------------------------------------------

export function StepContrato({ onNext }: { onNext: () => void }): React.ReactElement {
  return (
    <>
      <div style={estilosStep.cabecalho}>Leia o contrato</div>
      <div style={estilosStep.subtitulo}>Cláusulas conforme combinado com o vendedor.</div>
      <div style={{
        background: "oklch(1 0 0)",
        border: "1px solid oklch(0.85 0.005 270)",
        borderRadius: 10,
        padding: 14,
        fontSize: 11.5,
        lineHeight: 1.6,
        maxHeight: 260,
        overflowY: "auto",
        color: "oklch(0.20 0.01 270)",
        fontFamily: "Georgia, serif",
      }}>
        <strong>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</strong>
        <p style={{ marginTop: 8 }}>
          Pelo presente instrumento, o(a) CONTRATANTE concorda com os termos e
          condições descritos neste contrato…
        </p>
        <p>
          <em style={{ color: "oklch(0.5 0.01 270)" }}>
            [Cláusulas do template aparecerão aqui no contrato real]
          </em>
        </p>
      </div>
      <button style={estilosStep.btnAvancar} onClick={onNext}>Li e aceito →</button>
    </>
  );
}

// ---------------------------------------------------------------------------
// StepComprovante
// ---------------------------------------------------------------------------

export function StepComprovante({
  template,
  onNext,
}: {
  template: TemplateV2;
  onNext: () => void;
}): React.ReactElement {
  const pix  = template.pagamento?.chave_pix;
  const link = template.pagamento?.link_parcelamento;
  return (
    <>
      <div style={estilosStep.cabecalho}>Envie o comprovante</div>
      <div style={estilosStep.subtitulo}>
        Pague e nos envie o comprovante para prosseguir.
      </div>
      {pix && (
        <div style={{
          padding: "10px 12px",
          background: "oklch(0.96 0.005 150)",
          border: "1px solid oklch(0.75 0.10 150 / 0.4)",
          borderRadius: 8, fontSize: 12, marginBottom: 10,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, marginBottom: 4 }}>CHAVE PIX</div>
          <div style={{ fontFamily: "monospace" }}>{pix}</div>
        </div>
      )}
      {link && (
        <a href={link} style={{ display: "block", fontSize: 12, color: "oklch(0.45 0.18 295)", marginBottom: 10 }}>
          ↗ Pagar via link de parcelamento
        </a>
      )}
      <div style={{
        padding: 20, border: "1px dashed oklch(0.7 0.01 270)", borderRadius: 8,
        textAlign: "center", fontSize: 12, color: "oklch(0.5 0.01 270)", marginBottom: 4,
      }}>
        + Anexar comprovante
      </div>
      <button style={estilosStep.btnAvancar} onClick={onNext}>
        Comprovante enviado →
      </button>
    </>
  );
}
