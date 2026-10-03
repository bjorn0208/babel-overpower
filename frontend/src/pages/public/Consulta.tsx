/**
 * Página pública de consulta de crédito/débito.
 *
 * URL: /consulta/:chave
 * App.tsx importa: import ConsultaPublica from "@/pages/public/Consulta"
 *
 * Orquestrador fino. Lógica pesada em `consulta/`:
 * tipos, hook, steps específicos.
 *
 * Reusa o design system da página pública de contrato:
 *  - injetarEstilosGlobais (estilos pp-*)
 *  - PpHeader, PpProgress, PpFooter, TelaCarregando, TelaErro (PpLayout)
 *  - PpIcone, PpUpload, PpAcoes (PpShared)
 *  - StepSelfie, StepDocumento (PpStepsMidia — via wrappers em StepsConsulta)
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { injetarEstilosGlobais } from "./contrato/estilos";
import {
  PpHeader,
  PpProgress,
  PpFooter,
  TelaCarregando,
  TelaErro,
} from "./contrato/PpLayout";
import {
  useConsultaPublica,
  derivarStepsConsulta,
} from "./consulta/use-consulta-publica";
import {
  StepDadosConsulta,
  StepSelfieConsulta,
  StepDocumentoConsulta,
  StepComprovanteConsulta,
  StepAguardando,
  StepResultadoConsulta,
} from "./consulta/StepsConsulta";
import type { IdStepConsulta, MetaStep } from "./consulta/tipos";
import type { MetaStep as MetaStepContrato } from "./contrato/tipos";

// Status que já passaram da coleta — definem em qual tela final o cliente cai ao
// (re)abrir o link. Qualquer status fora destes conjuntos é etapa de coleta e NÃO
// força o índice (o cliente segue preenchendo). Conjuntos evitam que um status novo
// no banco caia silenciosamente na 1ª tela (bug corrigido em 2026-06-04).
const STATUS_EM_RESULTADO: ReadonlySet<string> = new Set(["concluida"]);
const STATUS_EM_PROCESSAMENTO: ReadonlySet<string> = new Set([
  "comprovante_enviado",
  "validando",
  "fila_revisao",
  "consultando",
  "erro",
  "recusada",
]);

export default function ConsultaPublica() {
  const { chave } = useParams<{ chave: string }>();

  // Injeta CSS do design system uma vez
  useEffect(() => {
    injetarEstilosGlobais();
  }, []);

  const { consulta, carregando, erro, uploadArquivo, submeter, gerarPdf } =
    useConsultaPublica(chave);

  // Estado da jornada
  const [dados, setDados] = useState<Record<string, string>>({});
  const [urlSelfie, setUrlSelfie] = useState<string | null>(null);
  const [urlDocumento, setUrlDocumento] = useState<string | null>(null);
  const [urlComprovante, setUrlComprovante] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);
  const [erroEnvio, setErroEnvio] = useState(false);

  // Sincroniza o índice ao (re)abrir o link conforme o status da consulta:
  // concluída → resultado; em processamento (comprovante enviado, validando, fila de
  // revisão, consultando, erro, recusada) → tela "aguardando"; coleta → não força.
  useEffect(() => {
    if (!consulta) return;
    const steps = derivarStepsConsulta(consulta);
    let alvo = -1;
    if (STATUS_EM_RESULTADO.has(consulta.status)) {
      alvo = steps.findIndex((s) => s.id === "resultado");
    } else if (STATUS_EM_PROCESSAMENTO.has(consulta.status)) {
      alvo = steps.findIndex((s) => s.id === "aguardando");
    }
    if (alvo >= 0) setIndice(alvo);
  }, [consulta]);

  if (carregando) return <TelaCarregando />;
  if (erro || !consulta) return <TelaErro mensagem={erro ?? "Erro desconhecido"} />;

  const c = consulta;
  const stepsAtivos = derivarStepsConsulta(c);
  const stepAtual = stepsAtivos[indice] as MetaStep | undefined;
  const isUltimoStep =
    stepAtual?.id === "resultado" || stepAtual?.id === "aguardando";

  function avancar() {
    setIndice((i) => Math.min(i + 1, stepsAtivos.length - 1));
  }
  function voltar() {
    setIndice((i) => Math.max(0, i - 1));
  }

  // Link universal: o documento vai numa chave fixa ("documento") e o tipo é
  // DETECTADO pelo que o cliente digitou (≤11 dígitos = CPF, senão CNPJ).
  const docDigitado = (dados["documento"] ?? "").replace(/\D/g, "");
  const tipoDetectado: "cpf" | "cnpj" = docDigitado.length > 11 ? "cnpj" : "cpf";
  // Preço a cobrar: snapshot da consulta (se já fixado) ou o preço do tipo detectado.
  const precoEfetivo =
    c.preco ?? (tipoDetectado === "cnpj" ? c.preco_venda_cnpj : c.preco_venda_cpf);

  // Submete a consulta SEMPRE que a próxima etapa for "aguardando" — ou seja,
  // quando esta é a última etapa de coleta. Vale com pagamento (step comprovante)
  // OU sem pagamento (tenant sem PIX): antes, a submissão só ocorria no comprovante,
  // então sem PIX os dados (documento, selfie, urls) se perdiam e a consulta travava.
  async function avancarComSubmissao() {
    const proximo = stepsAtivos[indice + 1];
    if (proximo?.id !== "aguardando") {
      avancar();
      return;
    }
    setErroEnvio(false);
    const ok = await submeter({
      documento: docDigitado,
      tipo_doc: tipoDetectado,
      dados_cliente: dados,
      url_selfie: urlSelfie,
      url_documento: urlDocumento,
      url_comprovante: urlComprovante,
    });
    if (ok) avancar();
    else setErroEnvio(true);
  }

  const nomeEmpresa = c.nome_empresa ?? c.titulo ?? "Empresa";

  function renderStep(id: IdStepConsulta) {
    switch (id) {
      case "dados":
        return (
          <StepDadosConsulta
            consulta={c}
            dados={dados}
            setDados={setDados}
            onAvancar={avancarComSubmissao}
          />
        );
      case "selfie":
        return (
          <StepSelfieConsulta
            consulta={c}
            urlSelfie={urlSelfie}
            setUrlSelfie={setUrlSelfie}
            upload={uploadArquivo}
            onAvancar={avancarComSubmissao}
            onVoltar={voltar}
          />
        );
      case "documento":
        return (
          <StepDocumentoConsulta
            urlDocumento={urlDocumento}
            setUrlDocumento={setUrlDocumento}
            upload={uploadArquivo}
            onAvancar={avancarComSubmissao}
            onVoltar={voltar}
          />
        );
      case "comprovante":
        return (
          <StepComprovanteConsulta
            consulta={c}
            preco={precoEfetivo}
            urlComprovante={urlComprovante}
            setUrlComprovante={setUrlComprovante}
            upload={uploadArquivo}
            onAvancar={avancarComSubmissao}
            onVoltar={voltar}
          />
        );
      case "aguardando":
        return <StepAguardando />;
      case "resultado":
        return (
          <StepResultadoConsulta
            consulta={c}
            onGerarPdf={gerarPdf}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="pp-app">
      <div className="pp-bg" />
      <PpHeader nomeEmpresa={nomeEmpresa} logoUrl={c.logo_url} letreiro="Consulta de crédito" />

      {c.banner_url && (
        <div style={{ width: "100%", maxHeight: 180, overflow: "hidden", lineHeight: 0 }}>
          <img
            src={c.banner_url}
            alt=""
            style={{ width: "100%", height: "auto", objectFit: "cover", display: "block" }}
          />
        </div>
      )}

      <main className="pp-main">
        {/* Barra de progresso — oculta nos steps finais */}
        {!isUltimoStep && (
          <PpProgress
            stepsAtivos={stepsAtivos as unknown as MetaStepContrato[]}
            indiceAtual={indice}
          />
        )}

        {/* Cartão do step ativo */}
        <div className="pp-card pp-fade" key={stepAtual?.id ?? "step"}>
          {stepAtual && renderStep(stepAtual.id)}
        </div>

        {erroEnvio && (
          <div
            role="alert"
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: "var(--pp-r)",
              background: "var(--pp-warn-soft)",
              border: "1px solid var(--pp-warn)",
              color: "var(--pp-warn)",
              fontSize: 13,
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            Não foi possível enviar sua consulta. Confira os dados e tente novamente.
          </div>
        )}
      </main>

      <PpFooter chavePublica={c.chave_publica} nomeEmpresa={nomeEmpresa} />
    </div>
  );
}
