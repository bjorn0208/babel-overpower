/**
 * Mentor de Humanização do Chat Treino: apresenta-se, roda a análise (botão Analisar) e mostra
 * a nota de humanização (antes × depois das correções), o comentário dele, pontos fortes,
 * ajustes e as regras que foram para a conversa padrão.
 */

import { type AnaliseTreino, faixaHumanizacao } from "./treino-dados";

function fmtPct(n: number): string {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}%`;
}

function Medidor({ rotulo, nota, destaque }: { rotulo: string; nota: number; destaque?: boolean }) {
  const f = faixaHumanizacao(nota);
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {rotulo}
      </div>
      <div style={{ fontSize: destaque ? 30 : 22, fontWeight: 800, color: f.cor, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        {fmtPct(nota)}
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, nota)}%`, height: "100%", background: f.cor, borderRadius: 999 }} />
      </div>
      <div style={{ fontSize: 11.5, color: f.cor }}>{f.rotulo}</div>
    </div>
  );
}

function Lista({ titulo, itens, icone }: { titulo: string; itens: string[]; icone: string }) {
  if (!itens.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>{titulo}</div>
      {itens.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, lineHeight: 1.45 }}>
          <span aria-hidden>{icone}</span>
          <span>{t}</span>
        </div>
      ))}
    </div>
  );
}

export function PainelMentor({
  analisando,
  analise,
  erro,
  podeAnalisar,
  qtdCorrecoes,
  produtoNome,
  onAnalisar,
  onFechar,
}: {
  analisando: boolean;
  analise: AnaliseTreino | null;
  erro: string | null;
  podeAnalisar: boolean;
  qtdCorrecoes: number;
  produtoNome: string | null;
  onAnalisar: () => void;
  onFechar: () => void;
}) {
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "var(--os-janela-fundo, rgb(18, 14, 34))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            background: "linear-gradient(135deg, oklch(0.78 0.16 75 / 0.3), oklch(0.65 0.22 300 / 0.3))",
            border: "1px solid oklch(0.78 0.16 75 / 0.4)",
            flexShrink: 0,
          }}
        >
          🧠
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Mentor de Humanização</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            99,99% humano · o 0,01% é culpa dos circuitos
          </div>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar mentor"
          style={{ background: "none", border: "none", color: "var(--txt-2)", fontSize: 18, cursor: "pointer", padding: 6 }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {!analise && !analisando && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            E aí! Eu sou o Mentor 😄 Converse com a agente como se fosse o cliente e, onde ela escorregar, clica no{" "}
            <b>✎</b> da bolha e escreve como vc falaria. No fim, aperta <b>Analisar</b>: eu te dou a nota de humanização dela,
            o que dá pra melhorar, e a conversa com as suas correções vira a <b>conversa padrão</b>
            {produtoNome ? (
              <>
                {" "}de <b>{produtoNome}</b>
              </>
            ) : null}
            . Tmj!
          </div>
        )}

        {analisando && (
          <div className="muted" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="pp-camera-spinner" style={{ width: 16, height: 16 }} /> Lendo a conversa linha por linha… já já te falo.
          </div>
        )}

        {erro && !analisando && (
          <div style={{ fontSize: 12.5, color: "oklch(0.8 0.17 30)", padding: 10, borderRadius: 10, border: "1px solid oklch(0.72 0.19 30 / 0.4)" }}>
            ⚠ {erro}
          </div>
        )}

        {analise && !analisando && (
          <>
            <div style={{ display: "flex", gap: 14 }}>
              <Medidor rotulo="Como ela falou" nota={analise.humanizacao_original} />
              <Medidor rotulo="Com suas correções" nota={analise.humanizacao_final} destaque />
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              Referência: o Mentor é 99,99%. Nenhuma agente passa disso.
            </div>
            {analise.comentario_mentor && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "oklch(0.78 0.16 75 / 0.08)",
                  border: "1px solid oklch(0.78 0.16 75 / 0.25)",
                  fontSize: 13,
                  lineHeight: 1.55,
                }}
              >
                {analise.comentario_mentor}
              </div>
            )}
            <Lista titulo="Mandou bem" itens={analise.pontos_fortes} icone="✅" />
            <Lista titulo="Dá pra humanizar mais" itens={analise.ajustes} icone="🔧" />
            <Lista titulo="Regras que foram pra conversa padrão" itens={analise.diretrizes} icone="📌" />
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                fontSize: 12.5,
                background: "oklch(0.72 0.2 145 / 0.1)",
                border: "1px solid oklch(0.72 0.2 145 / 0.3)",
                color: "oklch(0.9 0.12 145)",
                lineHeight: 1.5,
              }}
            >
              📚 Conversa padrão {analise.produto ? `de ${analise.produto.nome}` : "geral"} salva em Agente → Conhecimento
              {analise.correcoes_aplicadas ? ` (${analise.correcoes_aplicadas} correção(ões) aplicada(s))` : ""}
              {analise.substituiu ? " — substituiu a anterior" : ""}. A agente já usa nas próximas conversas desse assunto.
            </div>
          </>
        )}
      </div>

      <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
        <span className="muted" style={{ fontSize: 11.5, flex: 1 }}>
          {qtdCorrecoes} correção(ões) nesta conversa
        </span>
        <button
          type="button"
          onClick={onAnalisar}
          disabled={!podeAnalisar || analisando}
          style={{
            padding: "9px 16px",
            borderRadius: 10,
            border: "1px solid oklch(0.78 0.16 75 / 0.5)",
            background: "oklch(0.78 0.16 75 / 0.2)",
            color: "oklch(0.92 0.12 75)",
            fontSize: 13,
            fontWeight: 700,
            cursor: !podeAnalisar || analisando ? "not-allowed" : "pointer",
            opacity: !podeAnalisar || analisando ? 0.5 : 1,
          }}
        >
          {analisando ? "Analisando…" : analise ? "Analisar de novo" : "Analisar"}
        </button>
      </div>
    </div>
  );
}
