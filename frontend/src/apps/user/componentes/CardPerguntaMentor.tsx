/**
 * CardPerguntaMentor.tsx — Modal que o dono usa pra responder uma pergunta
 * que o agente não soube responder e escalou pro loop Mentor.
 *
 * Recebe a pergunta já carregada e callbacks do hook usePerguntasMentor.
 * Usa ModalCentral pra consistência visual com o restante do OS.
 */

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquare, Reply, X } from "lucide-react";
import { toast } from "sonner";
import { ModalCentral } from "@/os/topo/ModalCentral";
import type { EstatisticasPerguntas, PerguntaMentor } from "../dados/use-perguntas-mentor";

interface Props {
  pergunta: PerguntaMentor;
  /** Histórico recente de perguntas já respondidas (aba Histórico). */
  respondidas?: PerguntaMentor[];
  /** Contagens exatas pro resumo do topo (geradas/por responder/respondidas/descartadas). */
  estatisticas?: EstatisticasPerguntas | null;
  onResponder: (id: string, resposta: string) => Promise<{ ok: boolean; erro?: string }>;
  onDescartar: (id: string) => Promise<{ ok: boolean; erro?: string }>;
  onFechar: () => void;
  /** Navegação na fila (opcional). Posição 1-based da pergunta atual. */
  indice?: number;
  /** Total de perguntas na fila. */
  total?: number;
  /** Volta pra pergunta anterior (null/undefined = sem anterior). */
  onAnterior?: () => void;
  /** Pula pra próxima pergunta sem responder (null/undefined = sem próxima). */
  onProxima?: () => void;
  /** Abre a conversa do cliente desta pergunta (janela isolada). */
  onAbrirConversa?: (conversationId: string) => void;
}

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

const AMBAR = "oklch(0.78 0.18 80)";
const ACENTO = "oklch(0.7 0.18 220)";

const s = {
  rotuloMini: {
    display: "block",
    fontSize: 9,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  } as React.CSSProperties,
  caixaPergunta: {
    background: "oklch(0.78 0.18 80 / 0.07)",
    border: "1px solid oklch(0.78 0.18 80 / 0.16)",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 12,
  } as React.CSSProperties,
  textarea: {
    width: "100%",
    resize: "vertical" as const,
    minHeight: 96,
    background: "oklch(0.15 0.04 280)",
    border: "1px solid oklch(0.98 0 0 / 0.1)",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--txt-1)",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 150ms ease-out",
  } as React.CSSProperties,
  btnGhost: {
    padding: "8px 14px",
    borderRadius: 8,
    background: "none",
    border: "1px solid oklch(0.98 0 0 / 0.1)",
    color: "var(--txt-3)",
    fontSize: 13,
    cursor: "pointer",
  } as React.CSSProperties,
  btnSecundario: {
    padding: "8px 14px",
    borderRadius: 8,
    background: "oklch(0.98 0 0 / 0.06)",
    border: "1px solid oklch(0.98 0 0 / 0.08)",
    color: "var(--txt-2)",
    fontSize: 13,
    cursor: "pointer",
  } as React.CSSProperties,
  btnNav: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "transparent",
    border: "1px solid oklch(0.98 0 0 / 0.1)",
    color: "var(--txt-2)",
  } as React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

export function CardPerguntaMentor({
  pergunta,
  respondidas = [],
  estatisticas = null,
  onResponder,
  onDescartar,
  onFechar,
  indice,
  total,
  onAnterior,
  onProxima,
  onAbrirConversa,
}: Props) {
  const tituloId = useId();
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  // Pergunta aberta via URL já respondida → cai direto no histórico.
  const [visao, setVisao] = useState<"responder" | "historico">(
    pergunta.status_loop === "aguardando_dono" ? "responder" : "historico",
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Trocar de pergunta (navegar/pular) limpa o textarea — a resposta digitada nunca
  // pode vazar pra outra pergunta.
  useEffect(() => {
    setResposta("");
  }, [pergunta.id]);

  const temNavegacao = typeof indice === "number" && typeof total === "number" && total > 1;

  async function handleResponder() {
    const texto = resposta.trim();
    if (!texto) { toast.warning("Digite sua resposta antes de enviar."); textareaRef.current?.focus(); return; }
    setEnviando(true);
    const res = await onResponder(pergunta.id, texto);
    setEnviando(false);
    if (!res.ok) { toast.error(`Erro ao enviar: ${res.erro ?? "tente novamente"}`); return; }
    // Pacote Marcos 2026-07-22: NÃO fechar aqui — o pai (avancarApos) já puxa a
    // próxima pergunta da fila e só fecha quando a fila esvazia. Fechar aqui
    // matava o avanço e obrigava reabrir o sino a cada resposta.
    toast.success("Resposta enviada — o agente vai responder o lead automaticamente.");
  }

  async function handleDescartar() {
    setDescartando(true);
    const res = await onDescartar(pergunta.id);
    setDescartando(false);
    if (!res.ok) { toast.error(`Erro ao descartar: ${res.erro ?? "tente novamente"}`); return; }
    toast.info("Pergunta descartada.");
  }

  const ocupado = enviando || descartando;

  return (
    <ModalCentral onClose={onFechar} width={520} ariaLabel="Perguntas do agente">
      {/* Meta-linha: status + tempo · fila + fechar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: AMBAR, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: AMBAR, letterSpacing: 0.2 }}>
          Aguardando você
        </span>
        <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.4)" }}>
          · {tempoRelativo(pergunta.criado_em)}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          {temNavegacao && visao === "responder" && (
            <>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.98 0 0 / 0.55)",
                  fontVariantNumeric: "tabular-nums",
                  marginRight: 2,
                }}
              >
                {indice} de {total}
              </span>
              <button
                onClick={onAnterior}
                disabled={!onAnterior || ocupado}
                aria-label="Pergunta anterior"
                title="Pergunta anterior"
                style={{ ...s.btnNav, opacity: onAnterior && !ocupado ? 1 : 0.35, cursor: onAnterior && !ocupado ? "pointer" : "not-allowed" }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={onProxima}
                disabled={!onProxima || ocupado}
                aria-label="Próxima pergunta"
                title="Próxima pergunta"
                style={{ ...s.btnNav, opacity: onProxima && !ocupado ? 1 : 0.35, cursor: onProxima && !ocupado ? "pointer" : "not-allowed" }}
              >
                <ChevronRight size={14} />
              </button>
            </>
          )}
          <button
            onClick={onFechar}
            aria-label="Fechar"
            style={{ ...s.btnNav, border: "none" }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Resumo com contagens exatas — espelha o cabeçalho da aba Perguntas do app Agente */}
      {estatisticas && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 12,
            fontSize: 11,
            color: "oklch(0.98 0 0 / 0.45)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ fontWeight: 600, color: "oklch(0.98 0 0 / 0.75)" }}>
            Perguntas do agente
          </span>
          <span>
            · {estatisticas.geradas} gerada{estatisticas.geradas === 1 ? "" : "s"} até agora
          </span>
          <span>
            · Por responder{" "}
            <b style={{ color: AMBAR }}>{estatisticas.porResponder}</b>
          </span>
          <span>
            · Respondidas{" "}
            <b style={{ color: "oklch(0.98 0 0 / 0.75)" }}>{estatisticas.respondidas}</b>
          </span>
          <span>
            · Descartadas{" "}
            <b style={{ color: "oklch(0.98 0 0 / 0.75)" }}>{estatisticas.descartadas}</b>
          </span>
        </div>
      )}

      {/* Alternância: responder pendente × histórico das respondidas */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {([
          { id: "responder" as const, rotulo: "Responder", conta: total ?? 0 },
          { id: "historico" as const, rotulo: "Respondidas", conta: respondidas.length },
        ]).map((v) => {
          const ativo = visao === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setVisao(v.id)}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                border: "none",
                background: ativo ? "oklch(0.7 0.18 220)" : "oklch(0.98 0 0 / 0.06)",
                color: ativo ? "oklch(0.98 0 0)" : "var(--txt-2)",
                fontSize: 12,
                fontWeight: ativo ? 600 : 400,
                cursor: "pointer",
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              {v.rotulo}
              <span
                style={{
                  background: ativo ? "oklch(0.98 0 0 / 0.25)" : "oklch(0.98 0 0 / 0.08)",
                  borderRadius: 10,
                  padding: "1px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {v.conta}
              </span>
            </button>
          );
        })}
      </div>

      {visao === "historico" ? (
        <div
          className="scroll"
          style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}
        >
          {respondidas.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--txt-3)", textAlign: "center", padding: "28px 0" }}>
              Nenhuma pergunta respondida ainda.
            </div>
          )}
          {respondidas.map((p) => (
            <div
              key={p.id}
              style={{
                background: "oklch(0.18 0.06 280 / 0.4)",
                border: "1px solid oklch(0.98 0 0 / 0.07)",
                borderRadius: 10,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(0.72 0.18 145)", flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: "oklch(0.72 0.18 145)" }}>
                  Respondida
                </span>
                <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.4)", marginLeft: "auto" }}>
                  {tempoRelativo(p.respondida_em ?? p.criado_em)}
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.45, color: "oklch(0.98 0 0)" }}>
                {p.pergunta}
              </div>
              {p.resposta_do_dono && (
                <div style={{ fontSize: 11.5, lineHeight: 1.45, color: "oklch(0.98 0 0 / 0.6)", whiteSpace: "pre-wrap" }}>
                  {p.resposta_do_dono}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Título */}
          <h2 id={tituloId} style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px", lineHeight: 1.3 }}>
            O agente travou numa pergunta e precisa de você
          </h2>

          {/* Pergunta — protagonista */}
          <div style={s.caixaPergunta}>
            <span style={{ ...s.rotuloMini, color: AMBAR }}>O agente precisa saber</span>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, lineHeight: 1.55, color: "oklch(0.98 0 0)" }}>
              {pergunta.pergunta}
            </p>
          </div>

          {/* Reformulação (se diferente) — contexto secundário */}
          {pergunta.pergunta_para_mentor && pergunta.pergunta_para_mentor !== pergunta.pergunta && (
            <div style={{ fontSize: 12, color: "oklch(0.98 0 0 / 0.55)", lineHeight: 1.5, margin: "0 2px 14px" }}>
              <span style={{ fontWeight: 600, color: "oklch(0.98 0 0 / 0.7)" }}>Contexto: </span>
              {pergunta.pergunta_para_mentor}
            </div>
          )}

          {/* Resposta */}
          <label
            htmlFor={`${tituloId}-resp`}
            style={{ ...s.rotuloMini, color: "oklch(0.98 0 0 / 0.45)", marginBottom: 6 }}
          >
            Sua resposta
          </label>
          <textarea
            id={`${tituloId}-resp`} ref={textareaRef} value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            placeholder="Responda do seu jeito, sem se preocupar com a forma…"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus rows={4} style={s.textarea}
            onFocus={(e) => { e.currentTarget.style.borderColor = "oklch(0.7 0.18 220 / 0.55)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "oklch(0.98 0 0 / 0.1)"; }}
          />
          <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.45)", marginTop: 6, lineHeight: 1.5 }}>
            O agente reescreve no estilo dele, entrega ao lead e guarda na base pra não te perguntar de novo.
          </div>

          {/* Ações */}
          <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center" }}>
            <button onClick={handleDescartar} disabled={ocupado} style={{ ...s.btnGhost, opacity: ocupado ? 0.6 : 1, cursor: ocupado ? "not-allowed" : "pointer" }}>
              {descartando ? "Descartando…" : "Descartar"}
            </button>
            {onAbrirConversa && pergunta.conversation_id && (
              <button
                onClick={() => {
                  onAbrirConversa(pergunta.conversation_id as string);
                  onFechar();
                }}
                disabled={ocupado}
                title="Abrir a conversa desse cliente"
                style={{ ...s.btnGhost, display: "inline-flex", alignItems: "center", gap: 6, opacity: ocupado ? 0.6 : 1, cursor: ocupado ? "not-allowed" : "pointer" }}
              >
                <MessageSquare size={13} /> Abrir conversa
              </button>
            )}
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              {onProxima ? (
                <button onClick={onProxima} disabled={ocupado} title="Pular pra próxima sem responder"
                  style={{ ...s.btnSecundario, opacity: ocupado ? 0.6 : 1, cursor: ocupado ? "not-allowed" : "pointer" }}>
                  Pular
                </button>
              ) : (
                <button onClick={onFechar} disabled={enviando} style={{ ...s.btnSecundario, opacity: enviando ? 0.6 : 1, cursor: enviando ? "not-allowed" : "pointer" }}>
                  Fechar
                </button>
              )}
              <button onClick={handleResponder} disabled={enviando || !resposta.trim()}
                style={{
                  padding: "8px 18px", borderRadius: 8, border: "none",
                  color: "oklch(0.98 0 0)", fontSize: 13, fontWeight: 600,
                  display: "inline-flex", alignItems: "center", gap: 6,
                  transition: "background 140ms ease-out",
                  background: enviando || !resposta.trim() ? "oklch(0.7 0.18 220 / 0.3)" : ACENTO,
                  cursor: enviando || !resposta.trim() ? "not-allowed" : "pointer",
                }}>
                <Reply size={14} /> {enviando ? "Enviando…" : "Responder"}
              </button>
            </div>
          </div>
        </>
      )}
    </ModalCentral>
  );
}
