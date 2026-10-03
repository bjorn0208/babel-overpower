/**
 * Aba Desistentes — lista leads que saíram da campanha (state=desistente).
 *
 * Mostra motivo da saída (`exit_reason`) — silêncio, frase negativa, recusa,
 * opt-out, manual, convertido (raro nesse bucket), campanha_deletada.
 */

import { motion } from "framer-motion";
import { UserMinus } from "lucide-react";

import { fadeSlideIn } from "@/os/motion/presets";

import {
  Vazio,
  nomeLead,
  type LeadCampanha,
  type MotivoSaidaLeadCampanha,
} from "../re-exports";

interface Props {
  leads: LeadCampanha[];
}

const MOTIVO_ROTULO: Record<MotivoSaidaLeadCampanha, string> = {
  silencio: "Silêncio",
  frase_negativa: "Frase negativa",
  recusa: "Recusou",
  opt_out: "Opt-out",
  manual: "Manual",
  convertido: "Convertido",
  campanha_deletada: "Campanha excluída",
};

export function AbaDesistentes({ leads }: Props) {
  if (leads.length === 0) {
    return <Vazio mensagem="Nenhum desistente ainda." icone={UserMinus} />;
  }
  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      {leads.map((l) => (
        <LinhaDesistente key={l.id} lead={l} />
      ))}
    </motion.div>
  );
}

function LinhaDesistente({ lead }: { lead: LeadCampanha }) {
  const nome = nomeLead(lead);
  const foto = lead.lead?.url_foto_perfil;
  const motivoLabel = lead.exit_reason ? MOTIVO_ROTULO[lead.exit_reason] : "—";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 14px",
        background: "oklch(0.65 0.24 25 / 0.05)",
        border: "1px solid oklch(0.65 0.24 25 / 0.18)",
        borderRadius: 10,
      }}
    >
      {foto ? (
        <img src={foto} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", opacity: 0.7 }} />
      ) : (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "oklch(0.65 0.24 25 / 0.2)",
            display: "grid",
            placeItems: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "oklch(0.98 0 0 / 0.7)",
          }}
        >
          {nome.slice(0, 2).toUpperCase()}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "oklch(0.98 0 0 / 0.85)" }}>{nome}</span>
        {lead.lead?.phone && (
          <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.4)", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
            {lead.lead.phone}
          </span>
        )}
      </div>

      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "oklch(0.65 0.24 25)",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {motivoLabel}
      </span>

      <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.45)" }}>
        Fase: {lead.phase}
      </span>

      <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.45)" }}>
        {lead.closed_at ? formatarData(lead.closed_at) : "—"}
      </span>
    </div>
  );
}

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return "—";
  }
}
