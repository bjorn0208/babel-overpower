/**
 * StepsConsulta — steps específicos da jornada pública de consulta.
 *
 * Reusa StepSelfie e StepDocumento do contrato (wrappers finos).
 * Reusa PpUpload e PpAcoes de PpShared.
 * Reusa PpIcone.
 */

import { useState } from "react";
import { PpIcone } from "@/pages/public/contrato/PpIcone";
import { PpUpload, PpAcoes } from "@/pages/public/contrato/PpShared";
import { StepSelfie as StepSelfieContrato } from "@/pages/public/contrato/PpStepsMidia";
import { StepDocumento as StepDocumentoContrato } from "@/pages/public/contrato/PpStepsMidia";
import type { DadosConsultaPublica } from "./tipos";
import { LaudoPublico } from "./LaudoPublico";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// StepDadosConsulta
// ---------------------------------------------------------------------------

export function StepDadosConsulta({
  consulta,
  dados,
  setDados,
  onAvancar,
}: {
  consulta: DadosConsultaPublica;
  dados: Record<string, string>;
  setDados: (v: Record<string, string>) => void;
  onAvancar: () => void;
}) {
  // Link universal: o documento vai numa chave fixa "documento" e o tipo é
  // detectado pelo que o cliente digita (≤11 dígitos = CPF, senão CNPJ).
  const docDigitado = (dados["documento"] ?? "").replace(/\D/g, "");
  const tipoDetectado = docDigitado.length > 11 ? "cnpj" : "cpf";
  const precoDetectado = tipoDetectado === "cnpj" ? consulta.preco_venda_cnpj : consulta.preco_venda_cpf;

  // Campos configurados pelo tenant (só os ativos). O documento é sempre pedido
  // e renderizado em destaque (é o objeto da consulta), fora dessa lista.
  const camposTenant = (consulta.campos_formulario ?? []).filter((c) => c.ativo && c.slug !== "documento");

  const valido =
    camposTenant.every((c) => !c.obrigatorio || (dados[c.slug] ?? "").trim().length > 1) &&
    docDigitado.length >= 11;

  function setCampo(slug: string, valor: string) {
    setDados({ ...dados, [slug]: valor });
  }

  return (
    <div className="pp-fade">
      <div className="pp-step-icon">
        <PpIcone nome="id" tamanho={20} />
      </div>
      <h2 className="pp-step-title">Seus dados</h2>
      <p className="pp-step-sub">
        Preencha as informações abaixo para iniciar a consulta de crédito.
      </p>

      {camposTenant.map((campo) => (
        <div className="pp-field" key={campo.slug}>
          <label className="pp-label">
            {campo.rotulo}
            {campo.obrigatorio && <span className="pp-req">*</span>}
          </label>
          <input
            className="pp-input"
            type={campo.tipo === "numero" ? "tel" : campo.tipo}
            inputMode={campo.tipo === "numero" || campo.tipo === "tel" ? "numeric" : undefined}
            value={dados[campo.slug] ?? ""}
            onChange={(e) => setCampo(campo.slug, e.target.value)}
            placeholder={`Digite ${campo.rotulo.toLowerCase()}`}
          />
        </div>
      ))}

      {/* Documento a consultar — sempre presente, em destaque */}
      <div
        className="pp-field"
        style={{
          background: "var(--pp-acc-soft)",
          border: "1px solid var(--pp-acc)",
          borderRadius: "var(--pp-r)",
          padding: "12px 14px",
        }}
      >
        <label className="pp-label">
          CPF ou CNPJ a consultar<span className="pp-req">*</span>
        </label>
        <input
          className="pp-input"
          type="text"
          inputMode="numeric"
          value={dados["documento"] ?? ""}
          onChange={(e) => setCampo("documento", e.target.value)}
          placeholder="Digite o CPF ou CNPJ que será consultado"
        />
        <div style={{ fontSize: 11, color: "var(--pp-acc)", marginTop: 6, fontWeight: 600 }}>
          {docDigitado.length >= 11
            ? `${tipoDetectado.toUpperCase()} detectado${precoDetectado != null ? ` · consulta por ${brl(precoDetectado)}` : ""}`
            : "É este documento que vamos consultar"}
        </div>
      </div>

      <div className="pp-actions">
        <button
          className="pp-btn pp-btn-primary pp-btn-block"
          type="button"
          onClick={onAvancar}
          disabled={!valido}
        >
          Continuar <PpIcone nome="chevr" tamanho={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrapper fino: StepSelfieConsulta
// Adapta DadosConsultaPublica para o shape esperado por StepSelfieContrato
// ---------------------------------------------------------------------------

export function StepSelfieConsulta({
  consulta,
  urlSelfie,
  setUrlSelfie,
  upload,
  onAvancar,
  onVoltar,
}: {
  consulta: DadosConsultaPublica;
  urlSelfie: string | null;
  setUrlSelfie: (v: string | null) => void;
  upload: (f: File, p: string) => Promise<string | null>;
  onAvancar: () => void;
  onVoltar: () => void;
}) {
  // Shape mínimo compatível com DadosContrato (só os campos usados por StepSelfie)
  const contratoCompat = {
    instrucao_selfie: consulta.instrucao_selfie,
    campos_obrigatorios: consulta.campos_obrigatorios,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (
    <StepSelfieContrato
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contrato={contratoCompat as any}
      urlSelfie={urlSelfie}
      setUrlSelfie={setUrlSelfie}
      upload={upload}
      onAvancar={onAvancar}
      onVoltar={onVoltar}
    />
  );
}

// ---------------------------------------------------------------------------
// Wrapper fino: StepDocumentoConsulta
// ---------------------------------------------------------------------------

export function StepDocumentoConsulta({
  urlDocumento,
  setUrlDocumento,
  upload,
  onAvancar,
  onVoltar,
}: {
  urlDocumento: string | null;
  setUrlDocumento: (v: string | null) => void;
  upload: (f: File, p: string) => Promise<string | null>;
  onAvancar: () => void;
  onVoltar: () => void;
}) {
  return (
    <StepDocumentoContrato
      urlDocumento={urlDocumento}
      setUrlDocumento={setUrlDocumento}
      upload={upload}
      onAvancar={onAvancar}
      onVoltar={onVoltar}
    />
  );
}

// ---------------------------------------------------------------------------
// StepComprovanteConsulta
// ---------------------------------------------------------------------------

export function StepComprovanteConsulta({
  consulta,
  preco,
  urlComprovante,
  setUrlComprovante,
  upload,
  onAvancar,
  onVoltar,
}: {
  consulta: DadosConsultaPublica;
  preco: number | null;
  urlComprovante: string | null;
  setUrlComprovante: (v: string | null) => void;
  upload: (f: File, p: string) => Promise<string | null>;
  onAvancar: () => void;
  onVoltar: () => void;
}) {
  const [carregando, setCarregando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCarregando(true);
    const url = await upload(f, "comprovante");
    setUrlComprovante(url);
    setCarregando(false);
  }

  function copiarPix() {
    if (!consulta.chave_pix) return;
    navigator.clipboard?.writeText(consulta.chave_pix).catch(() => null);
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
        Pague o valor via PIX e anexe o comprovante para liberarmos sua
        consulta.
      </p>

      {preco && consulta.chave_pix && (
        <div className="pp-pix-card">
          <div className="pp-pix-label">Valor da consulta</div>
          <div className="pp-pix-valor">{brl(preco)}</div>
          <div className="pp-pix-label">Chave PIX</div>
          <div className="pp-pix-key">
            <span>{consulta.chave_pix}</span>
            <button className="pp-link" type="button" onClick={copiarPix}>
              {copiado ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
        </div>
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
        rotuloAvancar="Enviar comprovante"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepAguardando
// ---------------------------------------------------------------------------

export function StepAguardando() {
  return (
    <div className="pp-fade pp-done">
      <div className="pp-done-check">
        <PpIcone nome="check" tamanho={36} espessura={2.5} />
      </div>
      <h2 className="pp-done-title">Comprovante recebido!</h2>
      <p className="pp-done-text">
        Recebemos seu pagamento. Assim que confirmado, sua consulta é liberada
        aqui. Você pode fechar esta página — enviaremos uma notificação quando
        o resultado estiver pronto.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepResultadoConsulta
// ---------------------------------------------------------------------------

export function StepResultadoConsulta({
  consulta,
  onGerarPdf,
}: {
  consulta: DadosConsultaPublica;
  onGerarPdf: () => Promise<void>;
}) {
  const [gerando, setGerando] = useState(false);

  async function handleGerarPdf() {
    setGerando(true);
    await onGerarPdf();
    setGerando(false);
  }

  if (!consulta.resultado) {
    return (
      <div className="pp-fade pp-done">
        <div
          className="pp-done-check"
          style={{ background: "var(--pp-warn-soft)", color: "var(--pp-warn)" }}
        >
          <PpIcone nome="warn" tamanho={32} espessura={2} />
        </div>
        <h2 className="pp-done-title">Aguardando resultado</h2>
        <p className="pp-done-text">
          Sua consulta ainda está sendo processada. Recarregue a página em
          instantes.
        </p>
      </div>
    );
  }

  return (
    <div className="pp-fade">
      <div className="pp-step-icon">
        <PpIcone nome="doc" tamanho={22} />
      </div>
      <h2 className="pp-step-title">Resultado da consulta</h2>
      <p className="pp-step-sub">
        Veja o relatório completo abaixo e baixe o PDF para guardar ou
        compartilhar.
      </p>

      <LaudoPublico resultado={consulta.resultado} />

      <button
        className="pp-btn pp-btn-primary pp-btn-block"
        type="button"
        onClick={handleGerarPdf}
        disabled={gerando}
        style={{ marginTop: 18 }}
      >
        {gerando ? "Gerando PDF…" : "Baixar PDF do resultado"}{" "}
        <PpIcone nome="doc" tamanho={14} />
      </button>

      {consulta.pdf_url && (
        <a
          href={consulta.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            textAlign: "center",
            marginTop: 10,
            fontSize: 12,
            color: "var(--pp-acc)",
            fontWeight: 600,
          }}
        >
          Abrir PDF gerado
        </a>
      )}

      {consulta.aviso_final && (
        <div
          style={{
            marginTop: 18,
            padding: "16px 18px",
            borderRadius: "var(--pp-r)",
            background: "var(--pp-success-soft)",
            border: "1px solid var(--pp-success)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--pp-success)" }}>
            {consulta.aviso_final}
          </div>
        </div>
      )}
    </div>
  );
}
