/**
 * Card de entrada dos Pacotes extras no mapa do Hub de Conhecimento.
 * Mostra quantos pacotes estão ligados para o agente e abre a tela dos pacotes.
 * Sem nenhum pacote visível pro tenant, não renderiza.
 */

import { motion } from "framer-motion";
import { ChevronRight, Sparkles } from "lucide-react";
import { tapPress } from "@/os/motion/presets";
import { contarLigados, usePacotesAgente } from "./use-pacotes-agente";

export function CardPacotesExtras({
  tenantId,
  agenteId,
  nonce,
  onAbrir,
}: {
  tenantId: string;
  agenteId: string | null;
  nonce: number;
  onAbrir: () => void;
}) {
  const { estado } = usePacotesAgente(tenantId, agenteId, nonce);
  const ligados = contarLigados(estado);
  const disponiveis = estado?.pacotes.length ?? 0;

  // 2026-09-18: pacote extra só pra quem tem algum liberado (hoje Carlos e Amorim) —
  // pros demais o card some. A RLS já esconde pacote da Babel não liberado.
  if (!estado || disponiveis === 0) return null;

  return (
    <motion.button
      whileTap={tapPress}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      type="button"
      onClick={onAbrir}
      aria-label={`Abrir pacotes extras (${ligados} ligado${ligados === 1 ? "" : "s"})`}
      style={{
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: 16,
        borderRadius: 14,
        color: "inherit",
        cursor: "pointer",
        background:
          "linear-gradient(135deg, oklch(0.78 0.14 75 / 0.14), oklch(0.65 0.22 280 / 0.18))",
        border: "1px solid oklch(0.78 0.14 75 / 0.3)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "grid",
          placeItems: "center",
          width: 38,
          height: 38,
          borderRadius: 11,
          flexShrink: 0,
          color: "oklch(0.85 0.14 75)",
          background: "oklch(0.78 0.14 75 / 0.16)",
          border: "1px solid oklch(0.78 0.14 75 / 0.3)",
        }}
      >
        <Sparkles size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "oklch(0.98 0 0)" }}>
          Pacotes extras
        </span>
        <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.6)", lineHeight: 1.5 }}>
          Upgrades de conhecimento que você liga e desliga. Desligados, o agente segue com o
          conhecimento padrão.
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            fontVariantNumeric: "tabular-nums",
            color: ligados > 0 ? "oklch(0.85 0.16 155)" : "oklch(0.98 0 0 / 0.3)",
          }}
        >
          {ligados}
        </span>
        <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.5)" }}>
          {estado ? `ligado${ligados === 1 ? "" : "s"} de ${disponiveis}` : "…"}
        </span>
      </div>
      <ChevronRight size={16} style={{ color: "oklch(0.98 0 0 / 0.4)", flexShrink: 0 }} />
    </motion.button>
  );
}
