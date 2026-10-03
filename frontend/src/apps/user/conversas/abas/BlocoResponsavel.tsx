/**
 * Bloco Responsável + Pausar/Ativar IA — extraído da AbaMente (2026-07-10,
 * Theus moveu pra aba Quem). Nome do responsável com dropdown da equipe;
 * sem membro humano atribuído, o próprio agente responde.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { duration, easing, tapPress } from "@/os/motion/presets";
import { AvatarAgente, useFotoCanal, useNomeAgente } from "@/components/avatar-agente";
import type { Conversa, MembroEquipe } from "../tipos";

interface BlocoResponsavelProps {
  conversa: Conversa;
  /** Equipe real (profiles) — lista do dropdown. */
  equipe?: MembroEquipe[];
  /** Troca o responsável (membro) da conversa — persiste no banco. */
  onAtribuirResponsavel?: (membroId: string | null) => void;
  /** Liga/pausa a IA desta conversa. */
  onToggleAgente?: (novo: boolean) => void;
}

export function BlocoResponsavel({ conversa, equipe, onAtribuirResponsavel, onToggleAgente }: BlocoResponsavelProps) {
  const fotoCanal = useFotoCanal();
  const [responsavelAberto, setResponsavelAberto] = useState(false);
  const refResp = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!responsavelAberto) return;
    const fora = (e: MouseEvent) => {
      if (refResp.current && !refResp.current.contains(e.target as Node)) setResponsavelAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setResponsavelAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [responsavelAberto]);
  const equipeAtiva = (equipe ?? []).filter((mm) => mm.ativo);
  const responsavel = (equipe ?? []).find((mm) => mm.id === conversa.responsavel_id);
  // Sem membro humano atribuído → o próprio AGENTE responde. Nome real puxado
  // de agentes_usuario.nome_agente (useNomeAgente, mesmo padrão de useFotoCanal).
  const nomeAgente = useNomeAgente() ?? "Agente";
  const nomeResponsavel = responsavel ? responsavel.nome : nomeAgente;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 2px 10px" }}>
      <div ref={refResp} style={{ position: "relative", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span
          className="muted tiny"
          style={{ textTransform: "uppercase", letterSpacing: 0.6, fontSize: 9, lineHeight: 1 }}
        >
          Responsável
        </span>
        <motion.button
          type="button"
          onClick={() => setResponsavelAberto((o) => !o)}
          whileTap={tapPress}
          aria-haspopup="listbox"
          aria-expanded={responsavelAberto}
          aria-label={`Responsável: ${nomeResponsavel}. Clique para trocar por um membro da equipe.`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "2px 4px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--txt-1)",
            fontSize: 14,
            fontWeight: 600,
            maxWidth: "100%",
          }}
        >
          {responsavel ? (
            <span
              aria-hidden="true"
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                flexShrink: 0,
                background: responsavel.foto_url
                  ? `url(${responsavel.foto_url}) center/cover`
                  : "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            />
          ) : (
            <AvatarAgente fotoCanal={fotoCanal} tamanho={22} semBorda alt={`Foto de ${nomeAgente}`} />
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nomeResponsavel}
          </span>
          <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.7, marginLeft: 10 }}>▾</span>
        </motion.button>
        {responsavel && responsavel.cargo_funcional && (
          <span className="muted tiny" style={{ paddingLeft: 4, fontSize: 10, lineHeight: 1 }}>
            {responsavel.cargo_funcional}
          </span>
        )}
        {responsavelAberto && (
          <motion.div
            role="listbox"
            aria-label="Escolher responsável da conversa"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: duration.fast, ease: easing.outExpo }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              minWidth: 220,
              maxHeight: 240,
              overflowY: "auto",
              background: "rgba(15, 12, 30, 0.97)",
              border: "1px solid var(--os-vidro-borda, rgba(255,255,255,0.12))",
              borderRadius: 12,
              backdropFilter: "blur(20px) saturate(160%)",
              WebkitBackdropFilter: "blur(20px) saturate(160%)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
              padding: 6,
              zIndex: 30,
            }}
          >
            <button
              type="button"
              role="option"
              aria-selected={!responsavel}
              onClick={() => {
                onAtribuirResponsavel?.(null);
                setResponsavelAberto(false);
              }}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                gap: 10,
                padding: "6px 8px",
                borderRadius: 8,
                background: !responsavel
                  ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.16), oklch(0.65 0.22 280 / 0.12))"
                  : "transparent",
                border: !responsavel ? "1px solid oklch(0.7 0.18 220 / 0.35)" : "1px solid transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: fotoCanal
                    ? `url(${fotoCanal}) center/cover`
                    : "linear-gradient(135deg, oklch(0.7 0.18 220), oklch(0.65 0.22 280))",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--txt-1)" }}>{nomeAgente}</div>
                <div className="muted tiny">IA responde</div>
              </div>
              {!responsavel && <span aria-hidden="true" style={{ fontSize: 12 }}>✓</span>}
            </button>
            {equipeAtiva.length === 0 && (
              <div className="muted small" style={{ padding: "8px 10px", fontStyle: "italic" }}>
                Nenhum membro ativo na equipe.
              </div>
            )}
            {equipeAtiva.map((mm) => {
              const ativo = mm.id === conversa.responsavel_id;
              return (
                <button
                  key={mm.id}
                  type="button"
                  role="option"
                  aria-selected={ativo}
                  onClick={() => {
                    onAtribuirResponsavel?.(mm.id);
                    setResponsavelAberto(false);
                  }}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: ativo
                      ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.16), oklch(0.65 0.22 280 / 0.12))"
                      : "transparent",
                    border: ativo ? "1px solid oklch(0.7 0.18 220 / 0.35)" : "1px solid transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: mm.foto_url
                        ? `url(${mm.foto_url}) center/cover`
                        : "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--txt-1)" }}>{mm.nome}</div>
                    <div className="muted tiny">{mm.cargo_funcional}</div>
                  </div>
                  {ativo && <span aria-hidden="true" style={{ fontSize: 12 }}>✓</span>}
                </button>
              );
            })}
          </motion.div>
        )}
      </div>
      <div style={{ flex: 1 }} />
      <motion.button
        type="button"
        onClick={() => onToggleAgente?.(!conversa.agente_ligado)}
        whileHover={{ scale: 1.04, transition: { duration: duration.fast, ease: easing.outExpo } }}
        whileTap={tapPress}
        aria-pressed={conversa.agente_ligado}
        aria-label={conversa.agente_ligado ? "Pausar agente IA · assumir manualmente" : "Reativar agente IA"}
        className="btn btn-ghost btn-sm"
        style={{ padding: "5px 12px", fontSize: 11, whiteSpace: "nowrap" }}
      >
        {conversa.agente_ligado ? "⏸ Pausar IA" : "▶ Ativar IA"}
      </motion.button>
    </div>
  );
}
