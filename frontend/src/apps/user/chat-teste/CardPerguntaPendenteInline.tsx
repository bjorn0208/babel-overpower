/**
 * CardPerguntaPendenteInline — GenUI inline do ciclo Mentor no Chat de Teste.
 *
 * Aparece entre as bolhas e o input quando Gate A1 detecta lacuna e aguarda
 * resposta do dono. Não bloqueia o input de mensagem normal.
 *
 * Estados (status_loop):
 *  aguardando_dono → textarea + botão enviar
 *  dono_respondeu  → spinner "processando"
 *  virou_bloco     → badge verde + link dossiê (some em 10s)
 *
 * Onda 8 RAG-first · 2026-05-29
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { PerguntaPendenteChatTeste } from "./use-pergunta-pendente-chat-teste";

interface CardPerguntaPendenteInlineProps {
  pergunta: PerguntaPendenteChatTeste;
  onResponder: (perguntaId: string, resposta: string) => Promise<{ ok: boolean; erro?: string }>;
  conversaId?: string | null;
}

const MAPA_GAVETA: Record<string, string> = {
  blocos_conhecimento: "Conhecimento",
  blocos_procedurais: "Procedimentos",
  blocos_gatilho: "Gatilhos",
  blocos_humanizacao: "Humanização",
  blocos_comportamento: "Comportamento",
  blocos_meta: "Meta",
};

function labelGaveta(gaveta: string | null): string {
  return gaveta ? (MAPA_GAVETA[gaveta] ?? gaveta) : "gaveta";
}

export function CardPerguntaPendenteInline({ pergunta, onResponder, conversaId }: CardPerguntaPendenteInlineProps) {
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sumindo, setSumindo] = useState(false);
  const refTextarea = useRef<HTMLTextAreaElement | null>(null);

  type StatusLoop = "aguardando_dono" | "dono_respondeu" | "virou_bloco" | "entregue_lead" | "descartada";
  const loop = pergunta.status_loop as StatusLoop;

  useEffect(() => {
    if (loop !== "aguardando_dono") return;
    const t = setTimeout(() => refTextarea.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [loop]);

  useEffect(() => {
    if (loop !== "virou_bloco") return;
    const t = setTimeout(() => setSumindo(true), 9000);
    return () => clearTimeout(t);
  }, [loop]);

  async function handleEnviar() {
    const texto = resposta.trim();
    if (!texto) { toast.error("Escreva sua resposta antes de enviar."); return; }
    setEnviando(true);
    const res = await onResponder(pergunta.id, texto);
    setEnviando(false);
    if (!res.ok) toast.error(`Erro ao enviar: ${res.erro ?? "falha desconhecida"}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void handleEnviar(); }
  }

  if (sumindo) return null;

  const gavetaLabel = labelGaveta(pergunta.gaveta_proposta);
  const escopoLabel = pergunta.escopo_proposto ?? "tenant";
  const linkDossie = conversaId ? `/conversas?conversa=${conversaId}&aba=mente&subaba=perguntas` : null;
  const eBotaoAtivo = !enviando && !!resposta.trim();

  return (
    <div
      role="region"
      aria-label="Pergunta pendente do Mentor — aguardando sua resposta"
      style={{
        margin: "0 12px 8px", borderRadius: 12, padding: "12px 14px",
        background: "linear-gradient(135deg,rgba(245,158,11,0.08),rgba(234,88,12,0.06),rgba(245,158,11,0.08))",
        border: "1.5px solid rgba(245,158,11,0.35)",
        display: "flex", flexDirection: "column", gap: 10,
        animation: loop === "aguardando_dono" ? "mentor-pulse 2.4s ease-in-out infinite" : "none",
      }}
    >
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{ fontSize: 16, filter: loop === "aguardando_dono" ? "drop-shadow(0 0 4px rgba(245,158,11,0.6))" : "none" }}>⚡</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(251,191,36,0.9)", textTransform: "uppercase", letterSpacing: 0.6 }}>
          Mentor · lacuna detectada
        </span>
      </div>

      {/* Pergunta original do lead em destaque */}
      <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--txt-1)", lineHeight: 1.5, padding: "8px 10px", borderLeft: "2px solid rgba(245,158,11,0.5)", background: "rgba(255,255,255,0.03)", borderRadius: "0 6px 6px 0" }}>
        "{String(pergunta.pergunta ?? "")}"
      </div>

      {/* aguardando_dono: textarea + botão */}
      {loop === "aguardando_dono" && (
        <>
          <textarea
            ref={refTextarea}
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={enviando}
            placeholder="Sua resposta aqui… (Ctrl+Enter envia)"
            rows={3}
            aria-label="Sua resposta para o agente repassar ao lead"
            style={{ width: "100%", borderRadius: 8, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: "var(--txt-1)", fontSize: 13, padding: "8px 10px", resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box", opacity: enviando ? 0.6 : 1 }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 10, color: "var(--txt-3)", fontStyle: "italic" }}>
              Responda aqui — viro bloco no RAG e entrego pro agente repassar ao lead.
            </span>
            <button
              type="button"
              onClick={() => void handleEnviar()}
              disabled={!eBotaoAtivo}
              aria-label="Enviar resposta pro agente"
              style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(245,158,11,0.40)", background: eBotaoAtivo ? "linear-gradient(135deg,rgba(245,158,11,0.25),rgba(234,88,12,0.20))" : "rgba(255,255,255,0.04)", color: eBotaoAtivo ? "rgba(251,191,36,0.95)" : "var(--txt-3)", fontSize: 12, fontWeight: 600, cursor: eBotaoAtivo ? "pointer" : "not-allowed", whiteSpace: "nowrap", transition: "all 120ms ease" }}
            >
              {enviando ? "Enviando…" : "⚡ Enviar pro agente"}
            </button>
          </div>
        </>
      )}

      {/* dono_respondeu: spinner */}
      {loop === "dono_respondeu" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px" }}>
          <span aria-hidden="true" style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(245,158,11,0.6)", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
          <span style={{ fontSize: 12, color: "rgba(251,191,36,0.8)", fontStyle: "italic" }}>
            Mentor está processando e salvando bloco…
          </span>
        </div>
      )}

      {/* virou_bloco / entregue_lead: badge sucesso */}
      {(loop === "virou_bloco" || loop === "entregue_lead") && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", color: "rgba(134,239,172,0.95)", fontSize: 11, fontWeight: 600 }}>
            <span aria-hidden="true">✓</span>
            {loop === "virou_bloco" ? `Bloco salvo · ${gavetaLabel} / ${escopoLabel}` : "Resposta entregue ao lead"}
          </span>
          {linkDossie && (
            <a href={linkDossie} style={{ fontSize: 11, color: "rgba(245,158,11,0.80)", textDecoration: "underline", textUnderlineOffset: 2 }} aria-label="Ver pergunta respondida no dossiê">
              ver no dossiê →
            </a>
          )}
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--txt-3)", fontStyle: "italic" }}>some em instantes</span>
        </div>
      )}
    </div>
  );
}
