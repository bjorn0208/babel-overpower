/**
 * Lápis do Chat Treino: o dono reescreve a resposta da agente como ela DEVERIA ter sido
 * e/ou deixa uma sugestão de melhoria. Vira base da conversa padrão no botão Analisar.
 */

import { useState } from "react";

export function ModalCorrecao({
  textoOriginal,
  corrigidoInicial,
  sugestaoInicial,
  salvando,
  onSalvar,
  onFechar,
}: {
  textoOriginal: string;
  corrigidoInicial: string;
  sugestaoInicial: string;
  salvando: boolean;
  onSalvar: (textoCorrigido: string, sugestao: string) => void;
  onFechar: () => void;
}) {
  const [corrigido, setCorrigido] = useState(corrigidoInicial || textoOriginal);
  const [sugestao, setSugestao] = useState(sugestaoInicial);

  const campo = {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--txt-1)",
    fontSize: 13.5,
    lineHeight: 1.5,
    fontFamily: "inherit",
    resize: "vertical" as const,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Corrigir resposta da agente"
      onClick={onFechar}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        background: "rgba(5, 3, 12, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "100%",
          overflowY: "auto",
          background: "var(--os-janela-fundo, rgb(20, 16, 36))",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>✎</span>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Corrigir resposta</div>
        </div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Escreva como a agente <b>deveria</b> ter respondido. No botão <b>Analisar</b>, a conversa com as suas correções vira
          a conversa padrão deste produto.
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>Ela disse</div>
        <div
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.03)",
            border: "1px dashed rgba(255,255,255,0.12)",
            fontSize: 13,
            whiteSpace: "pre-wrap",
            opacity: 0.8,
          }}
        >
          {textoOriginal}
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Como deveria ser
          </span>
          <textarea value={corrigido} onChange={(e) => setCorrigido(e.target.value)} rows={5} style={campo} autoFocus />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Sugestão de melhoria (opcional)
          </span>
          <textarea
            value={sugestao}
            onChange={(e) => setSugestao(e.target.value)}
            rows={2}
            placeholder='Ex.: "chame pelo nome", "não passe o preço antes de explicar"'
            style={campo}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onFechar}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--txt-2)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={() => onSalvar(corrigido, sugestao)}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "1px solid oklch(0.72 0.2 145 / 0.5)",
              background: "oklch(0.72 0.2 145 / 0.22)",
              color: "oklch(0.92 0.12 145)",
              fontSize: 13,
              fontWeight: 700,
              cursor: salvando ? "wait" : "pointer",
              opacity: salvando ? 0.6 : 1,
            }}
          >
            {salvando ? "Salvando…" : "Salvar correção"}
          </button>
        </div>
      </div>
    </div>
  );
}
