/**
 * PpStepsPagamento — steps de pagamento e comprovante.
 */

import { useState } from "react";
import type { DadosContrato, EscolhaPagamento } from "./tipos";
import { PpAcoes, PpUpload } from "./PpShared";
import { PpIcone } from "./PpIcone";
import { brl, resumoEscolhaPagamento } from "./helpers";
import { PagamentoComPlanos, escolhaCompleta } from "./PpPagamentoPlanos";

/* =========================================================================
   Step: Pagamento (escolha à vista / parcelado)
   ========================================================================= */
export function StepPagamento({
  contrato,
  escolha,
  setEscolha,
  onAvancar,
  onVoltar,
}: {
  contrato: DadosContrato;
  escolha: EscolhaPagamento | null;
  setEscolha: (e: EscolhaPagamento) => void;
  onAvancar: () => void;
  onVoltar: () => void;
}) {
  const dp = contrato.dados_pagamento;
  if (!dp) return null;

  // F3b: contrato novo traz os planos prontos do Postgres (junto/separado,
  // parcela cravada, resto na 1ª) — o client só exibe e o lead escolhe.
  if (dp.planos?.junto) {
    return (
      <div className="pp-fade">
        <div className="pp-step-icon">
          <PpIcone nome="dollar" tamanho={20} />
        </div>
        <h2 className="pp-step-title">Como você quer pagar?</h2>
        <p className="pp-step-sub">
          Escolha uma opção. O contrato é atualizado automaticamente com a sua
          escolha.
        </p>
        <PagamentoComPlanos planos={dp.planos} escolha={escolha} setEscolha={setEscolha} />
        <PpAcoes
          onVoltar={onVoltar}
          onAvancar={onAvancar}
          avancarDisabled={!escolhaCompleta(dp.planos, escolha)}
        />
      </div>
    );
  }

  const totalAvista = dp.total_avista;
  // Parcelamento real do template, gravado pela RPC em dados_pagamento.
  const entrada = dp.entrada ?? 0;
  const parcelas = dp.parcelas ?? dp.max_parcelas;
  // F0 (2026-06-03): a RPC às vezes grava valor_parcela=null (molde sem o campo), o que
  // escondia a opção "Parcelado" e travava a liberação. Quando faltar, calcula na hora:
  // (total - entrada) / parcelas. Conserta retroativo os contratos já pendentes.
  const valorParcela =
    dp.valor_parcela && dp.valor_parcela > 0
      ? dp.valor_parcela
      : parcelas && parcelas > 1
        ? Math.round(((totalAvista - entrada) / parcelas) * 100) / 100
        : 0;
  const temParcelado = parcelas > 1 && valorParcela > 0;

  return (
    <div className="pp-fade">
      <div className="pp-step-icon">
        <PpIcone nome="dollar" tamanho={20} />
      </div>
      <h2 className="pp-step-title">Como você quer pagar?</h2>
      <p className="pp-step-sub">
        Escolha uma opção. O contrato é atualizado automaticamente com a sua
        escolha.
      </p>

      {/* Cartão: à vista */}
      <div
        className={`pp-pay-card ${escolha?.modo === "avista" ? "is-on" : ""}`}
        onClick={() => setEscolha({ modo: "avista", parcelas: null })}
        role="button"
        tabIndex={0}
        onKeyDown={(e) =>
          e.key === "Enter" && setEscolha({ modo: "avista", parcelas: null })
        }
      >
        <div className="pp-pay-radio" />
        <div style={{ flex: 1 }}>
          <div className="pp-pay-title">À vista</div>
          <div className="pp-pay-detail">
            Pague{" "}
            <span className="pp-pay-num">{brl(totalAvista)}</span> via PIX no
            ato da assinatura.
          </div>
        </div>
      </div>

      {/* Cartão: parcelado — versão fixa do template (entrada + N× parcela) */}
      {temParcelado && (
        <div
          className={`pp-pay-card ${escolha?.modo === "parcelado" ? "is-on" : ""}`}
          onClick={() => setEscolha({ modo: "parcelado", parcelas })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            e.key === "Enter" && setEscolha({ modo: "parcelado", parcelas })
          }
        >
          <div className="pp-pay-radio" />
          <div style={{ flex: 1 }}>
            <div className="pp-pay-title">Parcelado</div>
            <div className="pp-pay-detail">
              {entrada > 0 && (
                <>
                  Entrada de{" "}
                  <span className="pp-pay-num">{brl(entrada)}</span> +{" "}
                </>
              )}
              <span className="pp-pay-num">{parcelas}×</span> de{" "}
              <span className="pp-pay-num">{brl(valorParcela)}</span>
            </div>
          </div>
        </div>
      )}

      <PpAcoes
        onVoltar={onVoltar}
        onAvancar={onAvancar}
        avancarDisabled={!escolha?.modo}
      />
    </div>
  );
}

/* =========================================================================
   Step: Comprovante (PIX / link parcelamento)
   ========================================================================= */
export function StepComprovante({
  contrato,
  escolha,
  urlComprovante,
  setUrlComprovante,
  upload,
  onAvancar,
  onVoltar,
}: {
  contrato: DadosContrato;
  escolha: EscolhaPagamento | null;
  urlComprovante: string | null;
  setUrlComprovante: (v: string | null) => void;
  upload: (f: File, p: string) => Promise<string | null>;
  onAvancar: () => void;
  onVoltar: () => void;
}) {
  const [carregando, setCarregando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const dp = contrato.dados_pagamento;
  const totalAvista = dp?.total_avista ?? 0;
  // Respeita a forma escolhida no step de pagamento: parcelado mostra
  // entrada + parcelas; à vista (ou sem escolha) mostra o total.
  const entrada = dp?.entrada ?? 0;
  const parcelas = dp?.parcelas ?? dp?.max_parcelas ?? 0;
  // F0 (2026-06-03): mesma defesa do StepPagamento — calcula a parcela quando a RPC
  // não gravou valor_parcela (molde sem o campo). (total - entrada) / parcelas.
  const valorParcela =
    dp?.valor_parcela && dp.valor_parcela > 0
      ? dp.valor_parcela
      : parcelas > 1
        ? Math.round(((totalAvista - entrada) / parcelas) * 100) / 100
        : 0;
  const ehParcelado =
    escolha?.modo === "parcelado" && parcelas > 1 && valorParcela > 0;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCarregando(true);
    const url = await upload(f, "comprovante");
    setUrlComprovante(url);
    setCarregando(false);
  }

  function copiarPix() {
    if (!contrato.chave_pix) return;
    navigator.clipboard?.writeText(contrato.chave_pix).catch(() => null);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="pp-fade">
      <div className="pp-step-icon">
        <PpIcone nome="money" tamanho={20} />
      </div>
      <h2 className="pp-step-title">Pagamento</h2>
      <p className="pp-step-sub">
        Pague o valor abaixo e anexe o comprovante para concluir a assinatura.
      </p>

      {contrato.chave_pix && (
        <div className="pp-pix-card">
          <div className="pp-pix-label">Valor a pagar</div>
          {/* F3b: contrato novo → resumo vem dos planos do Postgres conforme a escolha
              (junto = 1 linha; separado = 1 linha por produto). Legado → cálculo antigo. */}
          {(() => {
            const linhas = resumoEscolhaPagamento(dp, escolha);
            if (linhas) {
              return linhas.map((l) => (
                <div key={l} className="pp-pix-valor" style={linhas.length > 1 ? { fontSize: 16 } : undefined}>
                  {l}
                </div>
              ));
            }
            return ehParcelado ? (
              <div className="pp-pix-valor">
                {entrada > 0 ? `Entrada de ${brl(entrada)} + ` : ""}
                {parcelas}× de {brl(valorParcela)}
              </div>
            ) : (
              <div className="pp-pix-valor">{brl(totalAvista)}</div>
            );
          })()}
          <div className="pp-pix-label">Chave PIX</div>
          <div className="pp-pix-key">
            <span>{contrato.chave_pix}</span>
            <button className="pp-link" type="button" onClick={copiarPix}>
              {copiado ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      {contrato.link_parcelamento && (
        <a
          href={contrato.link_parcelamento}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            textAlign: "center",
            padding: 14,
            background: "var(--pp-paper)",
            border: "1px solid var(--pp-border)",
            borderRadius: "var(--pp-r)",
            marginBottom: 14,
            color: "var(--pp-acc)",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          ↗ Pagar via link de parcelamento
        </a>
      )}

      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--pp-ink-3)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 8,
        }}
      >
        Anexe o comprovante
      </div>
      <PpUpload
        url={urlComprovante}
        onChange={handleFile}
        carregando={carregando}
        label="Selecionar comprovante"
        iconeName="doc"
      />
      <PpAcoes
        onVoltar={onVoltar}
        onAvancar={onAvancar}
        avancarDisabled={!urlComprovante}
        rotuloAvancar="Continuar"
      />
    </div>
  );
}
