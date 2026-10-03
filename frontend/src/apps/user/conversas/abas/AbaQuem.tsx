/**
 * Aba "Quem" — identidade · memória longa · linha do tempo do relacionamento.
 *
 * Fontes reais (Onda B):
 *  - leads (nome, telefone, foto_url, canal)
 *  - memoria_lead (resumo, pontos_chave)
 *  - engajamento_lead (score)
 *  - eventos_lead (timeline cronológica)
 *  - cofre_pii_lead (dados sensíveis sob permissão)
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { fadeSlideIn, stagger, staggerItem } from "@/os/motion/presets";
import type { AbaDossie, Conversa, Episodio, EventoTimeline, MembroEquipe } from "../tipos";
import { enriquecerDossieViaRPC, type DossieEnriquecido } from "../hooks/useConversasLive";
import { ResumoAbas } from "./ResumoAbas";
import { BlocoResponsavel } from "./BlocoResponsavel";

interface AbaQuemProps {
  conversa: Conversa;
  /** UUID real da conversa quando `conversa.id` é mock (ChatTeste antes do 1º turno).
   *  Onda 2026-05-14. */
  conversaIdOverride?: string | null;
  /** Pulo direto pra outra aba a partir dos cards da Visão geral. */
  onIrParaAba?: (aba: AbaDossie) => void;
  /** Equipe real (profiles) — pro bloco Responsável (movido da Mente, 2026-07-10). */
  equipe?: MembroEquipe[];
  /** Troca o responsável (membro) da conversa — persiste no banco. */
  onAtribuirResponsavel?: (membroId: string | null) => void;
  /** Liga/pausa a IA desta conversa. */
  onToggleAgente?: (novo: boolean) => void;
}

/**
 * Mapeia episódios da memoria_episodica → EventoTimeline pro Quem renderizar timeline real.
 * Cada episódio vira um evento "conversa_iniciada" com o resumo e a data de criação.
 * Onda 2026-05-14.
 */
function episodiosParaTimeline(eps: Episodio[]): EventoTimeline[] {
  return eps.map((e) => ({
    id: `ep-${e.id}`,
    tipo: "conversa_iniciada" as const,
    rotulo: e.episodio_resumo || e.gancho || "Episódio passado",
    data_iso: e.criado_em,
  }));
}

function formatarDataRelativa(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diff / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `${dias} dias atrás`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"} atrás`;
  const anos = Math.floor(meses / 12);
  return `${anos} ${anos === 1 ? "ano" : "anos"} atrás`;
}

function CorEngajamento(score: number): string {
  if (score >= 0.7) return "oklch(0.72 0.18 145)";
  if (score >= 0.4) return "oklch(0.78 0.18 80)";
  return "oklch(0.7 0.18 220)";
}

export function AbaQuem({ conversa, conversaIdOverride, onIrParaAba, equipe, onAtribuirResponsavel, onToggleAgente }: AbaQuemProps) {
  const lead = conversa.lead;
  const mem = lead.memoria_longa;
  const corEng = CorEngajamento(mem.engajamento_score);

  // Onda 2026-05-14 — hidrata memória longa + timeline com dados reais do RPC consolidado.
  // Re-fetcha em troca de lead, em troca de conversa real (override) ou em update da mente
  // (sinalizado pelo parent via mente.atualizado_em — ChatTeste atualiza após cada turno/realtime).
  const [dossie, setDossie] = useState<DossieEnriquecido | null>(null);
  // Incrementado quando algo criado inline (ex: retorno pelo card) precisa re-hidratar o dossiê.
  const [recarga, setRecarga] = useState(0);
  const convIdEfetivo = conversaIdOverride ?? conversa.id;
  useEffect(() => {
    let ativo = true;
    const leadId = conversa.lead?.id;
    if (!leadId) return;
    enriquecerDossieViaRPC(leadId, convIdEfetivo).then((d) => {
      if (ativo && d) setDossie(d);
    });
    return () => { ativo = false; };
  }, [conversa.lead?.id, convIdEfetivo, conversa.mente.atualizado_em, recarga]);

  // Resumo da memória longa: o RPC traz a narrativa em 1ª pessoa do agente
  // (crenca_conversa.resumo_agente). Se ainda não chegou, fallback no `mem.resumo` local.
  const resumoMostrar = dossie?.crenca_resumo ?? mem.resumo;

  // Timeline: usa episódios reais do RPC quando presentes; senão cai no `lead.timeline` (eventos
  // estruturados do banco, ainda não populados em todos os fluxos).
  const eventosTimeline = useMemo<EventoTimeline[]>(() => {
    const epis = dossie?.episodios ?? [];
    if (epis.length > 0) return episodiosParaTimeline(epis);
    return lead.timeline;
  }, [dossie?.episodios, lead.timeline]);

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", gap: 18, padding: "16px 18px" }}
    >
      <BlocoResponsavel
        conversa={conversa}
        equipe={equipe}
        onAtribuirResponsavel={onAtribuirResponsavel}
        onToggleAgente={onToggleAgente}
      />

      <section aria-label="Identidade">
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: lead.foto_url ? `url(${lead.foto_url}) center/cover` : "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{lead.nome}</div>
            <div className="muted small mono">{lead.telefone}</div>
            <div className="muted tiny" style={{ marginTop: 2 }}>
              {lead.canal === "whatsapp" ? "WhatsApp" : lead.canal === "instagram" ? "Instagram" : "Site"}
              {" · "}
              em contato {formatarDataRelativa(mem.primeiro_contato_iso)}
            </div>
          </div>
        </div>
      </section>

      <ResumoAbas
        conversa={conversa}
        dossie={dossie}
        onIrParaAba={onIrParaAba}
        conversaIdReal={convIdEfetivo}
        onCompromissoCriado={() => setRecarga((v) => v + 1)}
      />

      <section aria-label="Engajamento">
        <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
          Engajamento
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
            role="progressbar"
            aria-valuenow={Math.round(mem.engajamento_score * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Score de engajamento"
          >
            <div
              style={{
                height: "100%",
                width: `${mem.engajamento_score * 100}%`,
                background: corEng,
                boxShadow: `0 0 8px ${corEng}/0.6`,
                transition: "width 220ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </div>
          <span className="mono small" style={{ color: corEng }}>
            {Math.round(mem.engajamento_score * 100)}
          </span>
        </div>
        <div className="muted tiny" style={{ marginTop: 4 }}>
          {mem.engajamento_score >= 0.7 ? "Quente" : mem.engajamento_score >= 0.4 ? "Morno" : "Frio"}
        </div>
      </section>

      <section aria-label="Memória longa">
        <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
          Memória longa
        </div>
        {resumoMostrar ? (
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              margin: 0,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--txt-1)",
            }}
          >
            {resumoMostrar}
          </p>
        ) : (
          <span className="muted tiny">Ainda sem memória consolidada.</span>
        )}
        {mem.pontos_chave.length > 0 && (
          <ul style={{ margin: "8px 0 0", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            {mem.pontos_chave.map((p, idx) => (
              <li key={idx} className="small" style={{ color: "var(--txt-2)" }}>
                {p}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Linha do tempo">
        <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
          Linha do tempo
        </div>
        {eventosTimeline.length === 0 ? (
          <span className="muted tiny">Sem eventos registrados.</span>
        ) : (
          <motion.ol
            variants={stagger(0.04, 0.02)}
            initial="hidden"
            animate="visible"
            style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}
          >
            {eventosTimeline.map((ev) => (
              <motion.li
                key={ev.id}
                variants={staggerItem}
                className="row"
                style={{ gap: 10, alignItems: "flex-start" }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--os-acento-1, oklch(0.7 0.18 220))",
                    boxShadow: "0 0 6px var(--os-acento-1, oklch(0.7 0.18 220))",
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small" style={{ color: "var(--txt-1)" }}>{ev.rotulo}</div>
                  <div className="muted tiny">{formatarDataRelativa(ev.data_iso)}</div>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        )}
      </section>
    </motion.div>
  );
}
