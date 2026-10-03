/**
 * Aba Fechados — lista leads que concluíram a campanha (state=fechado).
 *
 * View simples: tabela com avatar + nome + telefone + fase final + quando
 * fechou. Sem ações de edição (histórico).
 */

import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";

import { fadeSlideIn } from "@/os/motion/presets";

import {
  Vazio,
  nomeLead,
  type LeadCampanha,
} from "../re-exports";

interface Props {
  leads: LeadCampanha[];
}

export function AbaFechados({ leads }: Props) {
  if (leads.length === 0) {
    return <Vazio mensagem="Nenhum lead fechado ainda." icone={CheckCircle} />;
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
        <LinhaFechado key={l.id} lead={l} />
      ))}
    </motion.div>
  );
}

function LinhaFechado({ lead }: { lead: LeadCampanha }) {
  const nome = nomeLead(lead);
  const foto = lead.lead?.url_foto_perfil;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 14px",
        background: "oklch(0.72 0.18 145 / 0.05)",
        border: "1px solid oklch(0.72 0.18 145 / 0.2)",
        borderRadius: 10,
      }}
    >
      {foto ? (
        <img src={foto} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "oklch(0.72 0.18 145 / 0.25)",
            display: "grid",
            placeItems: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "oklch(0.98 0 0)",
          }}
        >
          {nome.slice(0, 2).toUpperCase()}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "oklch(0.98 0 0)" }}>{nome}</span>
        {lead.lead?.phone && (
          <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.5)", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
            {lead.lead.phone}
          </span>
        )}
      </div>

      <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)" }}>
        Fase: <span style={{ color: "oklch(0.72 0.18 145)" }}>{lead.phase}</span>
      </span>

      <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)" }}>
        {lead.attempt_count} tentativa{lead.attempt_count === 1 ? "" : "s"}
      </span>

      <span style={{ fontSize: 11, color: "oklch(0.72 0.18 145)" }}>
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
