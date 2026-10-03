/**
 * modal-gerar-ia.tsx — Modal "Gerar com IA" (F3c — fluxo REAL).
 *
 * 3 estados: upload → processando → conferência.
 * upload      → arquivo (TXT/PDF/DOCX) ou texto colado
 * processando → extração (edge extrair-contrato-de-arquivo) + análise LLM
 *               (edge contratos-propor-estrutura) com progresso real por etapa
 * conferência → tenant revisa os 4 baldes e escolhe o produto; salvar grava
 *               miolo/campos/exigências no produto + moldura no molde ATIVO.
 *
 * Sub-componentes em estados-gerar-ia.tsx e conferencia-proposta.tsx.
 */

import React, { useCallback, useMemo, useState } from "react";
import { estilosGerarIA as e } from "./estilos-gerar-ia";
import { EstadoUpload, EstadoProcessando } from "./estados-gerar-ia";
import { ConferenciaProposta } from "./conferencia-proposta";
import { validarProposta, preSelecionarProduto, type PropostaEstrutura } from "./proposta";
import { extrairTextoDoArquivo, proporEstrutura, aplicarProposta } from "./extrair-real";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type EstadoModal = "upload" | "processando" | "conferencia";

export interface ModalGerarIAProps {
  ownerId: string | null;
  produtos: Array<{ id: string; nome: string }>;
  /** Chamado após salvar com sucesso — pai recarrega templates e abre o molde. */
  onAplicado: (templateId: string | null) => void;
  onFechar: () => void;
}

// ---------------------------------------------------------------------------
// ModalGerarIA
// ---------------------------------------------------------------------------

export function ModalGerarIA({ ownerId, produtos, onAplicado, onFechar }: ModalGerarIAProps): React.ReactElement {
  const [estado, setEstado] = useState<EstadoModal>("upload");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [texto, setTexto] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [progressoMsg, setProgressoMsg] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [proposta, setProposta] = useState<PropostaEstrutura | null>(null);
  const [avisosIA, setAvisosIA] = useState<string[]>([]);
  const [produtoId, setProdutoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [arrastando, setArrastando] = useState(false);

  const processarArquivo = useCallback((f: File) => {
    setArquivo(f);
    setErro(null);
    if (f.type.startsWith("text/")) {
      const reader = new FileReader();
      reader.onload = () => setTexto(reader.result as string);
      reader.readAsText(f);
    }
  }, []);

  const onDrop = useCallback((ev: React.DragEvent) => {
    ev.preventDefault();
    setArrastando(false);
    const f = ev.dataTransfer.files?.[0];
    if (f) processarArquivo(f);
  }, [processarArquivo]);

  const onFile = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (f) processarArquivo(f);
    // Permite re-selecionar o MESMO arquivo (change não dispara com value igual)
    ev.target.value = "";
  }, [processarArquivo]);

  // ── Fluxo real: extrair texto → IA propõe → conferência ──────────────────
  async function gerar() {
    if (!ownerId) { setErro("Sessão sem dono identificado — recarregue a página."); return; }
    if (!arquivo && !texto.trim()) return;
    setErro(null);
    setEstado("processando");
    try {
      setProgresso(15);
      setProgressoMsg("Lendo o documento…");
      const textoBruto = texto.trim() || (arquivo ? await extrairTextoDoArquivo(arquivo, ownerId) : "");
      if (textoBruto.length < 200) {
        throw new Error("O texto extraído ficou curto demais — confira se o arquivo tem texto selecionável (não imagem).");
      }

      setProgresso(45);
      setProgressoMsg("A IA está separando moldura, cláusulas e campos…");
      const resposta = await proporEstrutura(textoBruto);

      setProgresso(85);
      setProgressoMsg("Validando placeholders e campos…");
      setProposta(resposta.proposta);
      setAvisosIA(resposta.avisos);
      setProdutoId(preSelecionarProduto(resposta.proposta.nome_produto_detectado, produtos) ?? "");

      setProgresso(100);
      setProgressoMsg("Pronto");
      setEstado("conferencia");
    } catch (excecao) {
      setErro((excecao as Error).message);
      setEstado("upload");
    }
  }

  async function aprovar() {
    if (!ownerId || !proposta || !produtoId || salvando) return;
    setSalvando(true);
    setErro(null);
    const resultado = await aplicarProposta({ ownerId, produtoId, proposta });
    setSalvando(false);
    if (!resultado.ok) {
      setErro(resultado.mensagem ?? "Falha ao salvar a proposta.");
      return;
    }
    onAplicado(resultado.templateId ?? null);
  }

  function reiniciar() {
    setEstado("upload");
    setProposta(null);
    setAvisosIA([]);
    setProgresso(0);
    setProgressoMsg("");
    setErro(null);
  }

  const validacao = useMemo(
    () => (proposta ? validarProposta(proposta) : { erros: [], avisos: [] }),
    [proposta],
  );
  const validacaoComIA = useMemo(
    () => ({ erros: validacao.erros, avisos: [...avisosIA, ...validacao.avisos] }),
    [validacao, avisosIA],
  );

  const podeGerar = !!(arquivo || texto.trim());
  const podeAprovar = !!proposta && !!produtoId && validacao.erros.length === 0 && !salvando;

  return (
    <div style={e.backdrop} onClick={onFechar}>
      <div style={e.janela} onClick={(ev) => ev.stopPropagation()}>
        <div style={e.cabecalho}>
          <div>
            <h2 style={e.titulo}>
              <span style={{ color: "oklch(0.72 0.22 295)" }}>✦</span>
              {estado === "conferencia"
                ? "Confira o que a IA propôs"
                : "Anexar um contrato real e mapear com IA"}
            </h2>
            <p style={e.subtitulo}>
              {estado === "conferencia"
                ? "Nada é salvo sem a sua aprovação — ajuste o que quiser antes de confirmar."
                : "A IA separa a moldura do contrato, as cláusulas do produto, os campos do cliente e as exigências."}
            </p>
          </div>
          <button style={e.btnIcone} onClick={onFechar} aria-label="Fechar modal">✕</button>
        </div>

        <div style={e.corpo}>
          {erro && estado !== "processando" && (
            <div
              role="alert"
              style={{
                border: "1px solid oklch(0.70 0.19 25 / 0.35)", background: "oklch(0.70 0.19 25 / 0.10)",
                color: "oklch(0.78 0.15 25)", borderRadius: 10, padding: "9px 12px",
                fontSize: 12, lineHeight: 1.45, marginBottom: 12,
              }}
            >
              ✕ {erro}
            </div>
          )}
          {estado === "upload" && (
            <EstadoUpload
              arquivo={arquivo} texto={texto} setTexto={setTexto}
              arrastando={arrastando} setArrastando={setArrastando}
              onDrop={onDrop} onFile={onFile}
            />
          )}
          {estado === "processando" && (
            <EstadoProcessando progresso={progresso} progressoMsg={progressoMsg} />
          )}
          {estado === "conferencia" && proposta && (
            <ConferenciaProposta
              proposta={proposta}
              onMudar={setProposta}
              validacao={validacaoComIA}
              produtos={produtos}
              produtoId={produtoId}
              onProdutoId={setProdutoId}
            />
          )}
        </div>

        <div style={e.rodape}>
          {estado === "upload" && (
            <>
              <span style={e.notaPrivacidade}>
                🔒 Seu documento não fica armazenado — só os blocos aprovados viram parte do molde.
              </span>
              <button style={e.btn} onClick={onFechar}>Cancelar</button>
              <button
                style={{ ...e.btn, ...e.btnPrimario, ...(!podeGerar ? e.btnDesabilitado : {}) }}
                disabled={!podeGerar}
                onClick={() => { void gerar(); }}
              >
                ✦ Analisar contrato
              </button>
            </>
          )}
          {estado === "processando" && (
            <>
              <span style={{ ...e.notaPrivacidade, flex: 1 }}>Pode levar até um minuto…</span>
              <button style={{ ...e.btn, opacity: 0.5 }} disabled>Cancelar</button>
            </>
          )}
          {estado === "conferencia" && proposta && (
            <>
              <span style={e.notaPrivacidade}>
                {produtoId ? "Salva no produto escolhido e atualiza o molde ativo." : "Escolha o produto pra liberar o salvar."}
              </span>
              <button style={e.btn} onClick={reiniciar} disabled={salvando}>Analisar outro</button>
              <button
                style={{ ...e.btn, ...e.btnPrimario, ...(!podeAprovar ? e.btnDesabilitado : {}) }}
                disabled={!podeAprovar}
                onClick={() => { void aprovar(); }}
              >
                {salvando ? "Salvando…" : "✓ Aprovar e salvar"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
