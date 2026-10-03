/**
 * LinhaCampanha — card de listagem com KPI inline + ações.
 *
 * Extraído do shell `Campanha.tsx` pra manter cada arquivo ≤ 300 linhas
 * (norma cravada em CLAUDE.md). Recebe a campanha + leads_campanha já
 * carregados pelo shell — calcula KPI em memória (não bate banco aqui).
 */

import { motion } from "framer-motion";
import { Trash2, ChevronRight } from "lucide-react";

import { duration, easing, hoverLift, tapPress } from "@/os/motion/presets";

import {
  BadgeStatus,
  BadgeTipo,
  BotaoIcone,
  BotaoStatus,
  calcularKpi,
  type Campanha as CampanhaT,
  type LeadCampanha,
} from "./re-exports";

interface Props {
  campanha: CampanhaT;
  leads: LeadCampanha[];
  onAbrir: () => void;
  onAlternarStatus: () => void;
  onExcluir: () => void;
}

export function LinhaCampanha({
  campanha,
  leads,
  onAbrir,
  onAlternarStatus,
  onExcluir,
}: Props) {
  const kpi = calcularKpi(leads);

  return (
    <motion.div
      whileHover={hoverLift}
      whileTap={tapPress}
      onClick={onAbrir}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: 16,
        alignItems: "center",
        padding: 14,
        background: "oklch(0.18 0.06 280 / 0.35)",
        border: "1px solid oklch(0.98 0 0 / 0.06)",
        borderRadius: 12,
        cursor: "pointer",
        transition: `border-color ${duration.fast} ${easing.outExpo}`,
      }}
    >
      {/* Coluna 1 — Nome + meta */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.98 0 0)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {campanha.name}
          </span>
          <BadgeStatus s={campanha.status} />
          <BadgeTipo t={campanha.type} />
        </div>
        {campanha.objective && (
          <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {campanha.objective}
          </span>
        )}
        <div style={{ display: "flex", gap: 14, fontSize: 10, color: "oklch(0.98 0 0 / 0.45)" }}>
          <span>Iniciou {formatarData(campanha.starts_at)}</span>
          {campanha.ends_at && <span>· Termina {formatarData(campanha.ends_at)}</span>}
          {kpi.ultimo_contato && <span>· Último contato {formatarData(kpi.ultimo_contato)}</span>}
        </div>
      </div>

      {/* Coluna 2 — KPI em linha */}
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Mini rotulo="Total" valor={kpi.total} />
        <Mini rotulo="Ativos" valor={kpi.ativos} cor="oklch(0.72 0.18 145)" />
        <Mini rotulo="Fechados" valor={kpi.fechados} cor="oklch(0.7 0.18 220)" />
        <Mini rotulo="Desist." valor={kpi.desistentes} cor="oklch(0.65 0.24 25)" />
        <Mini rotulo="Conv." valor={`${kpi.taxa_conversao}%`} cor="oklch(0.78 0.18 80)" />
      </div>

      {/* Coluna 3 — Ações */}
      <div
        style={{ display: "flex", gap: 4, alignItems: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <BotaoStatus status={campanha.status} onClick={onAlternarStatus} />
        <BotaoIcone onClick={onExcluir} titulo="Excluir" perigo>
          <Trash2 size={14} />
        </BotaoIcone>
        <ChevronRight size={14} style={{ color: "oklch(0.98 0 0 / 0.3)", marginLeft: 4 }} />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Mini — KPI compacto inline (rotulo em cima, valor em baixo)
// ---------------------------------------------------------------------------

function Mini({
  rotulo,
  valor,
  cor = "oklch(0.98 0 0)",
}: {
  rotulo: string;
  valor: number | string;
  cor?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 48 }}>
      <span style={{ fontSize: 9, color: "oklch(0.98 0 0 / 0.4)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {rotulo}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: cor,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
        }}
      >
        {valor}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// formatarData — dd/mm/yyyy compacto (BRT)
// ---------------------------------------------------------------------------

function formatarData(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return "—";
  }
}
