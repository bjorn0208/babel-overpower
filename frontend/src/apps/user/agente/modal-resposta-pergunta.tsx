/**
 * ModalRespostaPergunta — responder lacuna OU editar resposta já dada.
 *
 * Modo edição: `valorInicial` preenchido → título e botão mudam, e a edição
 * reflete no bloco de conhecimento vinculado (RPC cuida disso).
 */

import React, { useState } from "react";
import type { PerguntaMentor } from "./use-perguntas-agente";

interface ModalRespostaPerguntaProps {
  pergunta: PerguntaMentor;
  /** Preenchido = modo edição da resposta existente. */
  valorInicial?: string;
  /** aprovarDireto: true = vai pro conhecimento na hora; false = caixa de pré-aprovados. Só no modo responder. */
  onConfirmar: (resposta: string, aprovarDireto: boolean) => Promise<void>;
  onFechar: () => void;
}

function estiloBotao(desab: boolean, cor: string): React.CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: desab ? "var(--bg-3)" : cor,
    color: desab ? "var(--txt-3)" : "oklch(0.98 0 0)",
    fontSize: 13,
    fontWeight: 600,
    cursor: desab ? "not-allowed" : "pointer",
  };
}

export function ModalRespostaPergunta({
  pergunta,
  valorInicial,
  onConfirmar,
  onFechar,
}: ModalRespostaPerguntaProps) {
  const editando = valorInicial !== undefined;
  const [resposta, setResposta] = useState(valorInicial ?? "");
  const [enviando, setEnviando] = useState(false);

  async function submeter(aprovarDireto: boolean) {
    if (!resposta.trim()) return;
    setEnviando(true);
    await onConfirmar(resposta.trim(), aprovarDireto);
    setEnviando(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editando ? "Editar resposta" : "Responder pergunta do lead"}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0.1 0.04 280 / 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        style={{
          background: "var(--bg-2)",
          border: "1px solid oklch(0.98 0 0 / 0.08)",
          borderRadius: 16,
          padding: 24,
          width: "min(480px, calc(100vw - 32px))",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {editando ? "Editar resposta" : "Responder lacuna do agente"}
        </div>

        <div
          style={{
            fontSize: 13,
            background: "var(--bg-3)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "var(--txt-1)",
            lineHeight: 1.5,
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: 9,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "oklch(0.98 0 0 / 0.45)",
              marginBottom: 3,
            }}
          >
            Pergunta original do lead
          </span>
          {pergunta.pergunta}
        </div>

        {!editando && pergunta.pergunta_para_mentor && (
          <div
            style={{
              fontSize: 13,
              background: "oklch(0.78 0.18 80 / 0.08)",
              border: "1px solid oklch(0.78 0.18 80 / 0.15)",
              borderRadius: 8,
              padding: "10px 12px",
              color: "oklch(0.98 0 0 / 0.8)",
              lineHeight: 1.5,
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "oklch(0.78 0.18 80)",
                marginBottom: 3,
              }}
            >
              Como o Mentor reformulou pra você
            </span>
            {pergunta.pergunta_para_mentor}
          </div>
        )}

        <textarea
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          placeholder="Sua resposta — o agente vai reformular no estilo dele antes de enviar ao lead…"
          rows={4}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          style={{
            width: "100%",
            resize: "vertical",
            background: "var(--bg-3)",
            border: "1px solid oklch(0.98 0 0 / 0.1)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "var(--txt-1)",
            fontSize: 13,
            fontFamily: "inherit",
            lineHeight: 1.5,
            boxSizing: "border-box",
          }}
        />

        {editando && pergunta.bloco_criado_id && (
          <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", lineHeight: 1.5 }}>
            Essa pergunta virou conhecimento do agente — editar aqui atualiza a base também.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onFechar}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "var(--bg-3)",
              color: "var(--txt-2)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          {editando ? (
            <button
              type="button"
              onClick={() => void submeter(true)}
              disabled={!resposta.trim() || enviando}
              style={estiloBotao(!resposta.trim() || enviando, "oklch(0.7 0.18 220)")}
            >
              {enviando ? "Salvando…" : "Salvar edição"}
            </button>
          ) : (
            <>
              {/* Pré-aprovado: trava até aprovação manual em Conhecimentos. */}
              <button
                type="button"
                onClick={() => void submeter(false)}
                disabled={!resposta.trim() || enviando}
                title="Guarda na caixa de pré-aprovados. O lead é respondido agora, mas a resposta só entra no conhecimento do agente depois que você aprovar."
                style={estiloBotao(!resposta.trim() || enviando, "oklch(0.62 0.19 295)")}
              >
                {enviando ? "Salvando…" : "Deixar em pré-aprovação"}
              </button>
              {/* Conhecimento: valida na hora. */}
              <button
                type="button"
                onClick={() => void submeter(true)}
                disabled={!resposta.trim() || enviando}
                title="Aprova agora: a resposta entra direto no conhecimento do agente."
                style={estiloBotao(!resposta.trim() || enviando, "oklch(0.62 0.17 150)")}
              >
                {enviando ? "Salvando…" : "Salvar no conhecimento"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
