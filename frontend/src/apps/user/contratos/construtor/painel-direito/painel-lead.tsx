/**
 * painel-lead.tsx — Mock visual da jornada do lead na página pública.
 *
 * Celular fake + barra de progresso + navegação manual.
 * Steps individuais extraídos em painel-lead-steps.tsx (≤ 300L por arquivo).
 * SEM conexão com banco — tudo em memória (fiação banco é 2e).
 */

import React, { useState } from "react";

import type { TemplateV2, PassoJornada } from "../tipos";
import type { ProdutoRef } from "./logica";
import { stepAtivo } from "./logica";
import {
  StepDados,
  StepPagamento,
  StepContrato,
  StepComprovante,
} from "./painel-lead-steps";
import {
  StepProvaGenerica,
  StepAssinatura,
  StepTestemunha,
} from "./painel-lead-provas";

// ---------------------------------------------------------------------------
// Carrinho padrão de exemplo (2e pode sobrescrever via prop)
// ---------------------------------------------------------------------------

/**
 * Carrinho de exemplo da jornada do lead.
 *
 * Δ 2026-09-08 — era uma lista fixa apontando pros produtos MOCK (`p-a`, `p-b`, `p-c`),
 * que não existem em template nenhum. `calcularCarrinho` descarta item cujo produto não
 * está em `produtos_aceitos`, então TUDO era descartado e a tela "Página do lead" mostrava
 * "À vista R$ 0,00" e "Parcelado R$ 0,00 — até 1×" pra qualquer tenant. O comentário
 * original já dizia "2e substitui por fetch do banco" — a substituição nunca veio.
 *
 * Agora o carrinho sai dos produtos reais do template, 1 de cada: é uma simulação do que
 * o lead vê, e o dono precisa reconhecer os próprios produtos e os próprios preços ali.
 */
export function carrinhoExemplo(template: TemplateV2) {
  return (template.produtos_aceitos ?? [])
    .slice(0, 3)
    .map((pa) => ({ produto_id: pa.produto_id, quantidade: 1 }));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PainelLeadProps {
  template: TemplateV2;
  /** Produtos reais do tenant — sem eles o cálculo descarta tudo e zera a tela. */
  produtosRef: ProdutoRef[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tituloStep(step: PassoJornada): string {
  const mapa: Record<PassoJornada, string> = {
    dados: "Seus dados",
    pagamento: "Forma de pagamento",
    contrato: "Leia o contrato",
    comprovante: "Comprovante",
    selfie: "Selfie",
    documento: "Documento",
    assinatura: "Assinatura",
    testemunha: "Testemunha",
  };
  return mapa[step] ?? step;
}

function descricaoSelfie(instrucao: string | undefined): string {
  if (instrucao === "mostrar_2_dedos") return "Mostre 2 dedos enquanto tira a foto.";
  if (instrucao === "segurar_documento") return "Segure o documento ao lado do rosto.";
  if (instrucao === "documento_e_2_dedos") return "Segure o documento e mostre 2 dedos.";
  return "Tire uma foto do seu rosto, bem iluminado.";
}

// ---------------------------------------------------------------------------
// ConteudoStep — despacha para o step correto
// ---------------------------------------------------------------------------

function ConteudoStep({
  stepId,
  template,
  produtosRef,
  onNext,
}: {
  stepId: PassoJornada;
  template: TemplateV2;
  produtosRef: ProdutoRef[];
  onNext: () => void;
}): React.ReactElement | null {
  const provas = template.provas;
  switch (stepId) {
    case "dados":
      return <StepDados template={template} onNext={onNext} />;
    case "pagamento":
      return <StepPagamento template={template} produtosRef={produtosRef} onNext={onNext} />;
    case "contrato":
      return <StepContrato onNext={onNext} />;
    case "comprovante":
      return <StepComprovante template={template} onNext={onNext} />;
    case "selfie":
      return (
        <StepProvaGenerica
          titulo="Selfie"
          descricao={descricaoSelfie(provas?.instrucao_selfie)}
          onNext={onNext}
        />
      );
    case "documento":
      return (
        <StepProvaGenerica
          titulo="Foto do documento"
          descricao="Envie uma foto nítida do seu RG ou CNH (frente)."
          onNext={onNext}
        />
      );
    case "assinatura":
      return <StepAssinatura onNext={onNext} />;
    case "testemunha":
      return <StepTestemunha num={provas?.num_testemunhas ?? 1} onNext={onNext} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// PainelLead
// ---------------------------------------------------------------------------

export function PainelLead({ template, produtosRef }: PainelLeadProps): React.ReactElement {
  const [stepIndex, setStepIndex] = useState(0);

  const ordemConfig: PassoJornada[] = (template.jornada_ordem ?? [
    "dados", "pagamento", "contrato", "comprovante",
    "selfie", "documento", "assinatura", "testemunha",
  ]) as PassoJornada[];

  const stepsAtivos = ordemConfig.filter((k) => stepAtivo(k, template));
  const total = stepsAtivos.length;
  const stepAtualId = stepsAtivos[stepIndex] ?? stepsAtivos[0];

  const avancar  = () => setStepIndex((i) => Math.min(total - 1, i + 1));
  const voltar   = () => setStepIndex((i) => Math.max(0, i - 1));
  const reiniciar = () => setStepIndex(0);

  const btnBase: React.CSSProperties = {
    padding: "5px 12px",
    fontSize: 12,
    border: "1px solid oklch(0.30 0.01 270)",
    borderRadius: 6,
    background: "transparent",
    cursor: "pointer",
  };

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700 }}>
        Jornada do lead na página pública
      </h3>
      <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "oklch(0.50 0.01 270)", lineHeight: 1.5 }}>
        Simulação de como o lead percorre a página após receber o link.
        A ordem segue o que você configurou em <strong>Pagamento</strong>.
      </p>

      {/* Barra de progresso */}
      <div style={{ display: "flex", gap: 3, marginBottom: 14 }}>
        {stepsAtivos.map((s, i) => (
          <div
            key={s + i}
            title={tituloStep(s)}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 99,
              background: i <= stepIndex
                ? "oklch(0.72 0.18 295)"
                : "oklch(0.30 0.01 270)",
            }}
          />
        ))}
      </div>

      {/* Celular fake */}
      <div style={{
        border: "2px solid oklch(0.28 0.02 270)",
        borderRadius: 24,
        overflow: "hidden",
        background: "oklch(0.97 0 0)",
        maxWidth: 320,
        margin: "0 auto",
        boxShadow: "0 8px 32px oklch(0 0 0 / 0.20)",
      }}>
        {/* Barra URL */}
        <div style={{
          padding: "8px 16px",
          background: "oklch(0.94 0 0)",
          borderBottom: "1px solid oklch(0.88 0.005 270)",
          fontSize: 10,
          color: "oklch(0.45 0.01 270)",
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>📄 contrato.plataforma.com</span>
          <span>{stepIndex + 1}/{total}</span>
        </div>

        {/* Tela do step */}
        <div style={{
          background: "oklch(0.97 0 0)",
          padding: "14px 16px 20px",
          overflowY: "auto",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          color: "oklch(0.15 0.01 270)",
        }}>
          {stepAtualId ? (
            <ConteudoStep
              stepId={stepAtualId}
              template={template}
              produtosRef={produtosRef}
              onNext={avancar}
            />
          ) : (
            <div style={{
              padding: 20,
              textAlign: "center",
              fontSize: 12,
              color: "oklch(0.5 0.01 270)",
            }}>
              Nenhum passo ativo. Configure campos, provas e pagamento.
            </div>
          )}
        </div>
      </div>

      {/* Controles externos */}
      <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 6 }}>
        <button
          onClick={voltar}
          disabled={stepIndex === 0}
          style={{
            ...btnBase,
            color: stepIndex === 0 ? "oklch(0.40 0.01 270)" : "oklch(0.70 0.01 270)",
            cursor: stepIndex === 0 ? "not-allowed" : "pointer",
          }}
        >
          ← Voltar
        </button>
        <button
          onClick={avancar}
          disabled={stepIndex === total - 1}
          style={{
            ...btnBase,
            color: stepIndex === total - 1 ? "oklch(0.40 0.01 270)" : "oklch(0.70 0.01 270)",
            cursor: stepIndex === total - 1 ? "not-allowed" : "pointer",
          }}
        >
          Avançar →
        </button>
        <button
          onClick={reiniciar}
          style={{ ...btnBase, color: "oklch(0.70 0.01 270)" }}
        >
          Reiniciar
        </button>
      </div>
    </div>
  );
}
