/**
 * NotificationCenter — drawer de notificações do Ragentic OS.
 *
 * Era em bundle.jsx:652-730.
 *
 * Refatorações (auditoria notificationcenter-2026-05-13.md):
 *  - P0: trigger com aria-haspopup + aria-expanded + aria-label dinâmico
 *  - P0: panel com role="dialog" + aria-labelledby + Escape (já existia)
 *  - P0: aria-live="polite" no container de itens
 *  - P1: motion AnimatePresence + stagger
 *  - P1: ordenação não-lidas → lidas (sem agrupamento por severidade — filosofia "minimalista, não-poluído")
 *  - Cores por tipo via tokens já existentes (mantém inline pra preservar visual)
 *
 * Compat: bundle.jsx envia { items, onClear, onDismiss, onAction }.
 */

import { useEffect, useId, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { duration, easing, stagger, staggerItem } from "@/os/motion/presets";
import { AvatarNotif } from "./AvatarNotif";
import { MidiaNotif } from "./MidiaNotif";

type TipoNotif = "info" | "sucesso" | "erro" | "aviso";

interface NotifItem {
  id: string;
  /** Tipo bruto do banco (handoff, conversa_humana, conversa_mensagem, contrato_assinado...). */
  tipo?: string;
  titulo: string;
  msg: string;
  t: string;
  icone?: string;
  lido?: boolean;
  acao?: unknown;
  acao_label?: string;
  /** Foto do WhatsApp do contato, quando houver. */
  foto_url?: string | null;
  /** Mídia da mensagem (imagem/áudio/vídeo/documento), quando houver. */
  midia_url?: string | null;
  midia_tipo?: string | null;
}

/**
 * Selo de contexto por tipo bruto. Só aparece quando agrega leitura — handoff e
 * atendimento humano. Mensagem comum fica limpa (o badge no avatar já identifica).
 */
const CONTEXTO: Record<string, { chip: string; classe: string }> = {
  handoff: { chip: "Pediu atendimento humano", classe: "handoff" },
  conversa_humana: { chip: "Em atendimento humano", classe: "humano" },
};

/** Placeholder de mídia (ex.: "[MEDIA_RECEBIDA]") — nunca deve aparecer cru no card. */
function ehPlaceholderMidia(msg?: string): boolean {
  return !!msg && /^\[[A-Z_]+\]$/.test(msg.trim());
}

interface NotificationCenterProps {
  items: NotifItem[];
  onClear: () => void;
  onDismiss: (id: string) => void;
  onAction: (n: NotifItem) => void;
}

/** Tipos visuais base — a cor de acento vive no AvatarNotif (badge) e no CSS (chip). */
const TIPOS_VISUAIS: ReadonlySet<TipoNotif> = new Set(["sucesso", "erro", "aviso", "info"]);

/**
 * Tipos de domínio (vindos do trigger de Conversas) → tipo visual base.
 * handoff/atendimento humano = aviso; mensagem = info; eventos de contrato = sucesso.
 */
const TIPO_VISUAL: Record<string, TipoNotif> = {
  handoff: "aviso",
  conversa_humana: "aviso",
  conversa_mensagem: "info",
  contrato_assinado: "sucesso",
  comprovante_enviado: "sucesso",
};

function resolverTipo(raw: unknown): TipoNotif {
  const s = typeof raw === "string" ? raw : "";
  if (TIPOS_VISUAIS.has(s as TipoNotif)) return s as TipoNotif;
  return TIPO_VISUAL[s] ?? "info";
}

const variantsPanel = {
  hidden: { opacity: 0, x: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: duration.normal, ease: easing.outExpo },
  },
  exit: {
    opacity: 0,
    x: 16,
    scale: 0.98,
    transition: { duration: duration.fast, ease: easing.inExpo },
  },
};

export function NotificationCenter({
  items,
  onClear,
  onDismiss,
  onAction,
}: NotificationCenterProps) {
  const [aberto, setAberto] = useState(false);
  const tituloId = useId();

  // Escape fecha
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto]);

  const naoLidas = items.filter((n) => !n.lido).length;

  // Ordenação minimalista: não-lidas primeiro, preservando ordem original
  const ordenados = useMemo(() => {
    return [...items].sort((a, b) => {
      const aLido = a.lido ? 1 : 0;
      const bLido = b.lido ? 1 : 0;
      return aLido - bLido;
    });
  }, [items]);

  const labelTrigger =
    naoLidas > 0
      ? `Notificações — ${naoLidas} não lida${naoLidas > 1 ? "s" : ""}`
      : "Notificações — todas lidas";

  return (
    <>
      <motion.button
        className="bar-cluster"
        onClick={() => setAberto((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={labelTrigger}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: duration.fast, ease: easing.outExpo }}
        style={{ cursor: "pointer", padding: "5px 10px", gap: 4 }}
      >
        <IconeBell />
        {naoLidas > 0 && (
          <span
            className="notif-count"
            aria-live="polite"
            aria-atomic="true"
          >
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {aberto && (
          <>
            <motion.div
              className="notif-backdrop"
              onClick={() => setAberto(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.fast }}
              aria-hidden="true"
            />
            <motion.div
              role="dialog"
              aria-modal="false"
              aria-labelledby={tituloId}
              className="notif-panel"
              variants={variantsPanel}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "18px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div>
                  <h2
                    id={tituloId}
                    className="h2"
                    style={{ fontSize: 18, margin: 0 }}
                  >
                    Notificações
                  </h2>
                  <div className="muted small">
                    {naoLidas} não lida{naoLidas !== 1 ? "s" : ""} ·{" "}
                    {items.length} total
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => setAberto(false)}
                  aria-label="Fechar"
                >
                  <IconeX size={14} />
                </button>
              </div>

              <div
                className="row gap-2"
                style={{
                  padding: "10px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={onClear}
                  disabled={items.length === 0}
                  aria-label="Limpar todas as notificações"
                >
                  Limpar tudo
                </button>
              </div>

              <motion.div
                className="scroll-body scroll"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                variants={stagger(0.04, 0.025)}
                initial="hidden"
                animate="visible"
              >
                {items.length === 0 && (
                  <div
                    className="center"
                    style={{ padding: 60, flexDirection: "column" }}
                  >
                    <IconeBell size={36} stroke="var(--txt-4)" />
                    <div className="muted small" style={{ marginTop: 10 }}>
                      Sem notificações
                    </div>
                    <div className="muted tiny">Você está em dia.</div>
                  </div>
                )}

                {ordenados.map((n) => {
                  const tipo: TipoNotif = resolverTipo(n.tipo);
                  const tipoBruto = typeof n.tipo === "string" ? n.tipo : undefined;
                  const ctx = tipoBruto ? CONTEXTO[tipoBruto] : undefined;
                  const temAcao = n.acao !== undefined && n.acao !== null;
                  return (
                    <motion.article
                      key={n.id}
                      variants={staggerItem}
                      className={`notif-item ${n.lido ? "lido" : ""}`}
                    >
                      <div className="notif-corpo">
                        <AvatarNotif
                          fotoUrl={n.foto_url}
                          titulo={n.titulo}
                          tipoBruto={tipoBruto}
                          tipoVisual={tipo}
                        />
                        <div className="notif-texto">
                          <div className="notif-linha-topo">
                            <h3 className="notif-nome">
                              {!n.lido && (
                                <span className="notif-dot" aria-hidden="true" />
                              )}
                              {n.titulo}
                            </h3>
                            <button
                              className="notif-x"
                              onClick={() => onDismiss(n.id)}
                              aria-label={`Dispensar notificação: ${n.titulo}`}
                            >
                              <IconeX size={11} stroke="var(--txt-4)" />
                            </button>
                          </div>

                          {ctx && (
                            <span className={`notif-chip ${ctx.classe}`}>
                              {ctx.chip}
                            </span>
                          )}

                          {n.midia_url && n.midia_tipo && (
                            <MidiaNotif url={n.midia_url} tipo={n.midia_tipo} />
                          )}

                          {!n.midia_url && ehPlaceholderMidia(n.msg) && (
                            <span className="notif-midia-pill" style={{ cursor: "default" }}>
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                              </svg>
                              Mídia recebida
                            </span>
                          )}

                          {n.msg && !ehPlaceholderMidia(n.msg) && (
                            <p className="notif-msg">{n.msg}</p>
                          )}

                          <div className="notif-rodape">
                            <time className="notif-tempo">{n.t}</time>
                            {temAcao && (
                              <motion.button
                                type="button"
                                className="notif-acao"
                                onClick={() => {
                                  onAction(n);
                                  onDismiss(n.id);
                                  setAberto(false);
                                }}
                                whileTap={{ scale: 0.96 }}
                                transition={{
                                  duration: duration.fast,
                                  ease: easing.outExpo,
                                }}
                                aria-label={`${n.acao_label ?? "Ver"} · ${n.titulo}`}
                              >
                                {n.acao_label ?? "Ver"} →
                              </motion.button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function IconeBell({
  size = 13,
  stroke = "currentColor",
}: {
  size?: number;
  stroke?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconeX({
  size = 14,
  stroke = "currentColor",
}: {
  size?: number;
  stroke?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}


