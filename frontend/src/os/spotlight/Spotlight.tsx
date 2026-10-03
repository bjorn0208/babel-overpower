/**
 * Spotlight — busca rápida com ⌘K do Ragentic OS.
 *
 * Era em bundle.jsx:568-637.
 *
 * Refatorações (auditoria spotlight-2026-05-13.md):
 *  - P0: role="dialog" + aria-modal + aria-labelledby
 *  - P0: input com role="combobox" + aria-expanded + aria-controls + aria-activedescendant
 *  - P0: navegação ↑↓ entre items + Enter ativa (combobox pattern WAI-ARIA)
 *  - P1: glassReveal motion no overlay + stagger entrance nos results
 *  - P1: feedback de empty state ("Nada encontrado pra...")
 *  - Roadmap v2: buscar leads + conversas + comandos via RPC busca_hibrida_*
 *
 * Compat: bundle.jsx envia { open, onClose, apps, onLaunch }. Mantemos shape.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  duration,
  easing,
  glassReveal,
  stagger,
  staggerItem,
} from "@/os/motion/presets";

type Lado = "user" | "admin" | "ambos";

interface App {
  slug: string;
  titulo: string;
  icone: string;
  lado: Lado;
}

interface Lead {
  id: string;
  nome: string;
  phone: string;
  avatar: string;
  cor: string;
}

interface SpotlightProps {
  open: boolean;
  onClose: () => void;
  apps: App[];
  /**
   * Lado ativo do OS. O Spotlight filtrava SÓ pelo termo digitado — o lado admin
   * achava e abria app de tenant (Conversas, Base…) pelo ⌘K mesmo com o app fora
   * do Dock e do Launchpad, que já filtram por lado. Sem isso, tirar o app do
   * lado admin não valia de nada.
   */
  side: Lado;
  onLaunch: (slug: string) => void;
  /**
   * Callback ao selecionar um lead nos resultados. Futuro: abre Atendimento
   * na conversa do lead. Hoje: opcional — se ausente, lead é só visual.
   */
  onSelectLead?: (lead: Lead) => void;
}

type Resultado =
  | { tipo: "app"; ref: App }
  | { tipo: "lead"; ref: Lead };

export function Spotlight({ open, onClose, apps, side, onLaunch, onSelectLead }: SpotlightProps) {
  const [q, setQ] = useState("");
  const [cursorIndex, setCursorIndex] = useState(0);
  const refInput = useRef<HTMLInputElement>(null);
  const refLista = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const listboxId = useId();

  // Foco automático ao abrir
  useEffect(() => {
    if (open) {
      setQ("");
      setCursorIndex(0);
      setTimeout(() => refInput.current?.focus(), 30);
    }
  }, [open]);

  // Memoizar resultados (apps + leads filtrados)
  const resultados = useMemo<Resultado[]>(() => {
    if (!open) return [];
    const ql = q.toLowerCase();
    const appsFiltrados = apps
      // Mesma regra do Dock (Dock.tsx:213) e do Launchpad (bundle.jsx:785):
      // app do lado ativo, ou marcado 'ambos'.
      .filter((a) => a.lado === side || a.lado === "ambos")
      .filter((a) => !ql || a.titulo.toLowerCase().includes(ql))
      .slice(0, 6)
      .map((ref) => ({ tipo: "app" as const, ref }));

    const leadsCandidato =
      typeof window !== "undefined"
        ? (window.RAGENTIC_DATA as unknown as { LEADS?: Lead[] })?.LEADS
        : undefined;
    // P1 runtime guard: confirma array antes de filter/slice
    const leadsRaw: Lead[] = Array.isArray(leadsCandidato) ? leadsCandidato : [];
    if (leadsCandidato !== undefined && !Array.isArray(leadsCandidato)) {
      console.warn("[Spotlight] window.RAGENTIC_DATA.LEADS não é array · busca de leads desabilitada");
    }
    const leadsFiltrados = ql
      ? leadsRaw
          .filter((l) => l.nome.toLowerCase().includes(ql))
          .slice(0, 4)
          .map((ref) => ({ tipo: "lead" as const, ref }))
      : [];

    return [...appsFiltrados, ...leadsFiltrados];
  }, [open, q, apps]);

  // Reset cursor quando query muda
  useEffect(() => {
    setCursorIndex(0);
  }, [q]);

  // Keyboard handler: Escape, ↑↓, Enter
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursorIndex((i) => Math.min(i + 1, resultados.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursorIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const r = resultados[cursorIndex];
        if (r?.tipo === "app") {
          onLaunch(r.ref.slug);
          onClose();
        } else if (r?.tipo === "lead") {
          onSelectLead?.(r.ref);
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, resultados, cursorIndex, onLaunch]);

  if (!open) return null;

  const apps_ = resultados.filter((r) => r.tipo === "app");
  const leads_ = resultados.filter((r) => r.tipo === "lead");
  const indexGlobal = (idLocal: number, offset: number) => offset + idLocal;

  return (
    <div
      className="spotlight-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "start center",
        paddingTop: "16vh",
        background: "rgba(0,0,0,0.32)",
        backdropFilter: "blur(4px)",
        zIndex: 800,
      }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloId}
            className="os-vidro-forte os-vidro"
            variants={glassReveal}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ width: 560, padding: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={tituloId} className="sr-only" style={visuallyHidden}>
              Spotlight — busca rápida
            </h2>

            <div
              className="row gap-2"
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <IconeBusca />
              <input
                ref={refInput}
                role="combobox"
                aria-expanded
                aria-controls={listboxId}
                aria-activedescendant={
                  resultados[cursorIndex]
                    ? `spotlight-item-${cursorIndex}`
                    : undefined
                }
                aria-autocomplete="list"
                aria-label="Buscar apps, leads, conversas"
                className="input"
                style={{
                  border: "none",
                  background: "transparent",
                  boxShadow: "none",
                  height: 32,
                  fontSize: 15,
                }}
                placeholder="Buscar apps, leads, conversas…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
              />
              <span
                className="chip mono"
                style={{ fontSize: 11 }}
                aria-hidden="true"
              >
                esc
              </span>
            </div>

            <motion.div
              ref={refLista}
              id={listboxId}
              role="listbox"
              aria-label="Resultados"
              style={{ maxHeight: 420, overflow: "auto" }}
              className="scroll"
              variants={stagger(0.04, 0.025)}
              initial="hidden"
              animate="visible"
            >
              {resultados.length === 0 && (
                <div
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    color: "var(--txt-3)",
                  }}
                  aria-live="polite"
                >
                  {q
                    ? `Nada encontrado pra "${q}"`
                    : "Digite pra buscar apps e leads"}
                </div>
              )}

              {apps_.length > 0 && (
                <div style={{ padding: 12 }}>
                  <div
                    className="title-section"
                    style={{ padding: "4px 8px 8px" }}
                  >
                    Aplicativos
                  </div>
                  {apps_.map((r, idx) => (
                    <SpotlightItem
                      key={`a-${r.ref.slug}`}
                      id={`spotlight-item-${indexGlobal(idx, 0)}`}
                      selecionado={cursorIndex === indexGlobal(idx, 0)}
                      onClick={() => {
                        onLaunch(r.ref.slug);
                        onClose();
                      }}
                      titulo={r.ref.titulo}
                      subtitulo={`${r.ref.lado === "admin" ? "Admin" : "Tenant"} · /${r.ref.slug}`}
                      icone={r.ref.icone}
                    />
                  ))}
                </div>
              )}

              {leads_.length > 0 && (
                <div
                  style={{
                    padding: 12,
                    borderTop: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    className="title-section"
                    style={{ padding: "4px 8px 8px" }}
                  >
                    Leads
                  </div>
                  {leads_.map((r, idx) => (
                    <SpotlightItem
                      key={`l-${r.ref.id}`}
                      id={`spotlight-item-${indexGlobal(idx, apps_.length)}`}
                      selecionado={
                        cursorIndex === indexGlobal(idx, apps_.length)
                      }
                      onClick={() => {
                        onSelectLead?.(r.ref);
                        onClose();
                      }}
                      titulo={r.ref.nome}
                      subtitulo={r.ref.phone}
                      avatar={{ texto: r.ref.avatar, cor: r.ref.cor }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SpotlightItemProps {
  id: string;
  selecionado: boolean;
  onClick: () => void;
  titulo: string;
  subtitulo: string;
  icone?: string;
  avatar?: { texto: string; cor: string };
}

function SpotlightItem({
  id,
  selecionado,
  onClick,
  titulo,
  subtitulo,
  icone,
  avatar,
}: SpotlightItemProps) {
  return (
    <motion.button
      id={id}
      role="option"
      aria-selected={selecionado}
      variants={staggerItem}
      whileHover={{ scale: 1.005 }}
      transition={{ duration: duration.fast, ease: easing.outExpo }}
      className="row gap-3"
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        background: selecionado ? "rgba(255,255,255,0.08)" : "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--txt-1)",
        borderRadius: 10,
        transition: "background 120ms ease",
      }}
      onClick={onClick}
    >
      {avatar ? (
        <div
          className="avatar"
          style={{
            background: avatar.cor,
            width: 28,
            height: 28,
            fontSize: 11,
          }}
        >
          {avatar.texto}
        </div>
      ) : (
        <div
          className="row center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background:
              "linear-gradient(135deg, var(--os-acento-1-soft), var(--os-acento-2-soft))",
            border: "1px solid var(--os-vidro-borda)",
          }}
        >
          <IconeApp nome={icone ?? "command"} />
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div className="h3" style={{ fontSize: 13 }}>
          {titulo}
        </div>
        <div className="muted tiny mono">{subtitulo}</div>
      </div>
    </motion.button>
  );
}

function IconeBusca() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--txt-3)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconeApp({ nome }: { nome: string }) {
  const Bundle =
    typeof window !== "undefined"
      ? (window as unknown as {
          Icon?: React.ComponentType<{ name: string; size: number }>;
        }).Icon
      : undefined;
  if (Bundle) return <Bundle name={nome} size={14} />;
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};
