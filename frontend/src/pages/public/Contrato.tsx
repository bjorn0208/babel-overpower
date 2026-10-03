/**
 * Página pública de assinatura de contrato — Fase 3b (design Claude, v2 dados).
 *
 * URL: /contrato/:chave
 * App.tsx importa: import ContratoPublico from "@/pages/public/Contrato"
 *
 * Orquestrador fino. Lógica pesada na subpasta `contrato/`:
 * estilos, tipos, helpers, hooks, layout e steps.
 *
 * Integração real (sem mocks):
 *  - Lê via RPC `obter_contrato_por_token`  (28 colunas)
 *  - Assina via RPC `assinar_contrato_publico` (+ forma_pagamento_escolhida)
 *  - Telemetria via RPC `registrar_evento_contrato`
 *  - Uploads no bucket `contract-signatures`
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { injetarEstilosGlobais } from "./contrato/estilos";
import { useContrato, useAssinar, derivarSteps } from "./contrato/use-contrato";
import { PpHeader, PpProgress, PpFooter, TelaCarregando, TelaErro } from "./contrato/PpLayout";
import {
  StepDados,
  StepContrato,
  StepPagamento,
  StepComprovante,
  StepSelfie,
  StepDocumento,
  StepAssinatura,
  StepTestemunha,
  StepConcluido,
} from "./contrato/PpSteps";
import type { EscolhaPagamento, IdStep, MetaStep } from "./contrato/tipos";

export default function ContratoPublico() {
  const { chave } = useParams<{ chave: string }>();

  // Injeta CSS do design system uma vez
  useEffect(() => {
    injetarEstilosGlobais();
  }, []);

  const { contrato, carregando, erro, registrarEvento, uploadArquivo, enviarComprovante, gerarPdf } =
    useContrato(chave);
  const { enviando, erro: erroAssinatura, submeter } = useAssinar();

  // Estado da jornada
  const [dados, setDados] = useState<Record<string, string>>({});
  const [escolha, setEscolha] = useState<EscolhaPagamento | null>(null);
  const [urlSelfie, setUrlSelfie] = useState<string | null>(null);
  const [urlDocumento, setUrlDocumento] = useState<string | null>(null);
  const [urlAssinatura, setUrlAssinatura] = useState<string | null>(null);
  const [urlComprovante, setUrlComprovante] = useState<string | null>(null);
  const [erroComprovante, setErroComprovante] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);

  // Pré-preenche dados e detecta contrato já assinado
  useEffect(() => {
    if (!contrato) return;
    if (contrato.dados_cliente) setDados(contrato.dados_cliente);
    const jaAssinado = [
      "assinado",
      "signed",
      "aguardando_validacao",
      "awaiting_validation",
    ].includes(contrato.status);
    if (jaAssinado) {
      const steps = derivarSteps(contrato);
      setIndice(steps.findIndex((s) => s.id === "concluido"));
    }
  }, [contrato]);

  if (carregando) return <TelaCarregando />;
  if (erro || !contrato) return <TelaErro mensagem={erro ?? "Erro desconhecido"} />;

  // A partir daqui `contrato` é não-null (guard acima garante)
  const c = contrato;
  const stepsAtivos = derivarSteps(c);
  const stepAtual = stepsAtivos[indice] as MetaStep | undefined;
  const isConcluido = stepAtual?.id === "concluido";

  function avancar() {
    setIndice((i) => Math.min(i + 1, stepsAtivos.length - 1));
  }
  function voltar() {
    setIndice((i) => Math.max(0, i - 1));
  }

  async function avancarComprovante() {
    // Fluxo after_sign: a assinatura já foi enviada, então o comprovante é
    // gravado em separado via RPC. No before_sign ele segue no payload da
    // assinatura (urlComprovante já está no estado quando o cliente assina).
    if (c.posicao_pagamento === "after_sign" && urlComprovante) {
      setErroComprovante(null);
      const ok = await enviarComprovante(urlComprovante);
      if (!ok) {
        // Envio falhou — NÃO avança (antes avançava mesmo com falha e o
        // comprovante se perdia). Mantém na etapa e mostra o erro pra retentar.
        setErroComprovante(
          "Não foi possível registrar o comprovante. Confira sua conexão e tente novamente.",
        );
        return;
      }
      void registrarEvento("comprovante_enviado");
    }
    avancar();
  }

  async function finalizarAssinatura(urlAssinaturaNova?: string | null) {
    if (!chave) return;
    // F3b: a URL da assinatura manuscrita chega DIRETO do step (setState é assíncrono —
    // confiar no estado aqui mandava null pro payload e a assinatura ficava órfã no storage).
    // Defesa em profundidade (bug 2026-06-11): só aceitar string — handler de clique
    // chegou a vazar o MouseEvent como argumento e o payload virava JSON circular.
    const urlNova = typeof urlAssinaturaNova === "string" ? urlAssinaturaNova : null;
    const urlAss = urlNova ?? urlAssinatura;
    if (urlNova) setUrlAssinatura(urlNova);
    await submeter({
      chave,
      contrato: c,
      dados,
      urlSelfie,
      urlDocumento,
      urlAssinatura: urlAss,
      urlComprovante,
      formaEscolhida: escolha,
      onSucesso: () => {
        void registrarEvento("assinatura_enviada");
        const steps = derivarSteps(c);
        const idxAssin = steps.findIndex((s) => s.id === "assinatura");
        const proximo = steps[idxAssin + 1];
        // after_sign: o comprovante vem logo após a assinatura — vai pra ele.
        // Caso contrário, encerra na conclusão (comportamento padrão).
        if (proximo?.id === "comprovante") {
          setIndice(idxAssin + 1);
        } else {
          setIndice(steps.findIndex((s) => s.id === "concluido"));
        }
      },
    });
  }

  const nomeEmpresa = c.nome_empresa ?? c.titulo ?? "Empresa";

  function renderStep(id: IdStep) {
    switch (id) {
      case "dados":
        return (
          <StepDados
            contrato={c}
            dados={dados}
            setDados={setDados}
            onAvancar={() => {
              void registrarEvento("identificacao_concluida");
              avancar();
            }}
          />
        );
      case "contrato":
        return (
          <StepContrato
            contrato={c}
            dados={dados}
            escolha={escolha}
            onAvancar={() => {
              void registrarEvento("preview_visualizado");
              avancar();
            }}
            onVoltar={voltar}
          />
        );
      case "pagamento":
        return (
          <StepPagamento
            contrato={c}
            escolha={escolha}
            setEscolha={setEscolha}
            onAvancar={avancar}
            onVoltar={voltar}
          />
        );
      case "comprovante":
        return (
          <StepComprovante
            contrato={c}
            escolha={escolha}
            urlComprovante={urlComprovante}
            setUrlComprovante={setUrlComprovante}
            upload={uploadArquivo}
            onAvancar={avancarComprovante}
            onVoltar={voltar}
          />
        );
      case "selfie":
        return (
          <StepSelfie
            contrato={c}
            urlSelfie={urlSelfie}
            setUrlSelfie={setUrlSelfie}
            upload={uploadArquivo}
            onAvancar={avancar}
            onVoltar={voltar}
          />
        );
      case "documento":
        return (
          <StepDocumento
            urlDocumento={urlDocumento}
            setUrlDocumento={setUrlDocumento}
            upload={uploadArquivo}
            onAvancar={avancar}
            onVoltar={voltar}
          />
        );
      case "assinatura":
        return (
          <StepAssinatura
            manuscrita={(c.campos_obrigatorios ?? []).includes("assinatura_manuscrita")}
            upload={uploadArquivo}
            onAvancar={finalizarAssinatura}
            onVoltar={voltar}
          />
        );
      case "testemunha":
        return (
          <StepTestemunha
            contrato={c}
            dados={dados}
            setDados={setDados}
            onAvancar={avancar}
            onVoltar={voltar}
          />
        );
      case "concluido":
        return <StepConcluido contrato={c} onGerarPdf={gerarPdf} />;
      default:
        return null;
    }
  }

  return (
    <div className="pp-app">
      <div className="pp-bg" />
      <PpHeader nomeEmpresa={nomeEmpresa} logoUrl={c.logo_url} />

      <main className="pp-main">
        {/* Barra de progresso — oculta no step concluído */}
        {!isConcluido && (
          <PpProgress stepsAtivos={stepsAtivos} indiceAtual={indice} />
        )}

        {/* Cartão do step ativo */}
        <div
          className="pp-card pp-fade"
          key={stepAtual?.id ?? "step"}
          style={enviando ? { pointerEvents: "none", opacity: 0.8 } : undefined}
        >
          {(erroAssinatura || erroComprovante) && (
            <div
              role="alert"
              style={{
                marginBottom: 16,
                padding: "12px 14px",
                borderRadius: 10,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {erroAssinatura ?? erroComprovante}
            </div>
          )}
          {stepAtual && renderStep(stepAtual.id)}
        </div>
      </main>

      <PpFooter
        chavePublica={c.chave_publica}
        nomeEmpresa={nomeEmpresa}
      />
    </div>
  );
}
