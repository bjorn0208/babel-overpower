/**
 * PpStepsFinais — steps de testemunha e conclusão da jornada.
 */

import { useEffect, useRef, useState } from "react";
import type { DadosContrato } from "./tipos";
import { PpAcoes } from "./PpShared";
import { PpIcone } from "./PpIcone";

/* =========================================================================
   Step: Testemunha(s)
   ========================================================================= */
export function StepTestemunha({
  contrato,
  dados,
  setDados,
  onAvancar,
  onVoltar,
}: {
  contrato: DadosContrato;
  dados: Record<string, string>;
  setDados: (v: Record<string, string>) => void;
  onAvancar: () => void;
  onVoltar: () => void;
}) {
  const n = contrato.num_testemunhas || 1;
  const completo = Array.from({ length: n }).every(
    (_, i) =>
      (dados[`testemunha_${i + 1}_nome`] ?? "").trim().length > 2 &&
      (dados[`testemunha_${i + 1}_cpf`] ?? "").trim().length > 9
  );

  return (
    <div className="pp-fade">
      <div className="pp-step-icon">
        <PpIcone nome="user" tamanho={20} />
      </div>
      <h2 className="pp-step-title">{n > 1 ? `${n} testemunhas` : "Testemunha"}</h2>
      <p className="pp-step-sub">
        Informe os dados {n > 1 ? "das pessoas" : "da pessoa"} que está
        testemunhando esta assinatura.
      </p>

      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: 16,
            marginBottom: 12,
            background: "var(--pp-bg-2)",
            borderRadius: "var(--pp-r)",
            border: "1px solid var(--pp-border)",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "var(--pp-ink-4)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 10,
            }}
          >
            Testemunha {i + 1}
          </div>
          <div className="pp-field">
            <label className="pp-label">
              Nome completo<span className="pp-req">*</span>
            </label>
            <input
              className="pp-input"
              type="text"
              value={dados[`testemunha_${i + 1}_nome`] ?? ""}
              onChange={(e) =>
                setDados({ ...dados, [`testemunha_${i + 1}_nome`]: e.target.value })
              }
            />
          </div>
          <div className="pp-field" style={{ marginBottom: 0 }}>
            <label className="pp-label">
              CPF<span className="pp-req">*</span>
            </label>
            <input
              className="pp-input"
              type="text"
              placeholder="000.000.000-00"
              value={dados[`testemunha_${i + 1}_cpf`] ?? ""}
              onChange={(e) =>
                setDados({ ...dados, [`testemunha_${i + 1}_cpf`]: e.target.value })
              }
            />
          </div>
        </div>
      ))}

      <PpAcoes onVoltar={onVoltar} onAvancar={onAvancar} avancarDisabled={!completo} />
    </div>
  );
}

/* =========================================================================
   Step: Concluído
   ========================================================================= */
export function StepConcluido({
  contrato,
  onGerarPdf,
}: {
  contrato: DadosContrato;
  onGerarPdf?: () => void;
}) {
  const [gerando, setGerando] = useState(false);
  const disparado = useRef(false);

  // Ao concluir, dispara a geração server-side do PDF (uma vez) se ainda não há.
  useEffect(() => {
    if (contrato.pdf_url || disparado.current || !onGerarPdf) return;
    disparado.current = true;
    setGerando(true);
    onGerarPdf();
  }, [contrato.pdf_url, onGerarPdf]);

  return (
    <div className="pp-fade pp-done">
      <div className="pp-done-check">
        <PpIcone nome="check" tamanho={40} espessura={3.2} />
      </div>
      <h2 className="pp-done-title">Pronto!</h2>
      <p className="pp-done-text">
        Seu contrato foi enviado para validação.{" "}
        {contrato.chave_pix
          ? "Assim que confirmarmos o pagamento, você recebe o PDF assinado."
          : "Você vai receber o PDF assinado em alguns minutos."}
      </p>
      {contrato.pdf_url ? (
        <a
          href={contrato.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="pp-btn pp-btn-ghost"
          style={{ textDecoration: "none", marginTop: 8 }}
        >
          <PpIcone nome="doc" tamanho={14} /> Baixar PDF do contrato
        </a>
      ) : gerando ? (
        <div
          className="pp-done-text"
          style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}
        >
          Gerando o PDF do contrato…
        </div>
      ) : null}
    </div>
  );
}
