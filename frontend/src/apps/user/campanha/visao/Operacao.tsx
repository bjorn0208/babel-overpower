/**
 * Aba Operação — Kanban drag-drop das fases da campanha.
 *
 * Cada fase de `fases_campanha` vira coluna. Cards = leads_campanha com
 * `state='ativo'`. Drag-drop nativo HTML5 atualiza `leads_campanha.phase`.
 * A RLS já valida ownership; o UPDATE direto é seguro.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, MessageCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fadeSlideIn, hoverLift } from "@/os/motion/presets";

import {
  PontoFase,
  Vazio,
  nomeLead,
  type Campanha as CampanhaT,
  type FaseCampanha,
  type LeadCampanha,
  type SupabaseBruto,
  type ToastApi,
} from "../re-exports";

interface Props {
  campanha: CampanhaT;
  fases: FaseCampanha[];
  leads: LeadCampanha[];
  t: ToastApi;
  onMudou: () => void;
  /**
   * Δ 2026-09-17 (Theus): "mostrar que horas cada mensagem vai enviar".
   * id de leads_campanha → rótulo pronto ("hoje 14:20" ou o motivo de não ter
   * horário). Calculado em `previsao-envio.ts` a partir da janela + tetos.
   */
  previsoes?: Record<string, string>;
}

const CORES_FASE = [
  "oklch(0.7 0.18 220)",   // azul
  "oklch(0.65 0.22 280)",  // lilás
  "oklch(0.72 0.18 145)",  // verde
  "oklch(0.78 0.18 80)",   // laranja
  "oklch(0.65 0.24 25)",   // vermelho
  "oklch(0.7 0.16 320)",   // rosa
];

export function AbaOperacao({ campanha, fases, leads, t, onMudou, previsoes }: Props) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);

  if (fases.length === 0) {
    return (
      <Vazio mensagem="Esta campanha ainda não tem fases configuradas. As fases padrão são criadas automaticamente quando você cria a campanha." />
    );
  }

  const leadsPorFase: Record<string, LeadCampanha[]> = {};
  for (const f of fases) leadsPorFase[f.slug] = [];
  for (const l of leads) {
    (leadsPorFase[l.phase] ??= []).push(l);
  }

  const mover = async (leadCampanhaId: string, novaFase: string) => {
    const sb = supabase as SupabaseBruto;
    const { error } = await sb
      .from("leads_campanha")
      .update({ phase: novaFase })
      .eq("id", leadCampanhaId);
    if (error) {
      t.error(error.message);
      return;
    }
    t.success("Lead movido");
    onMudou();
  };

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        display: "flex",
        gap: 12,
        height: "100%",
        overflowX: "auto",
        paddingBottom: 8,
      }}
    >
      {fases.map((f, i) => {
        const cor = f.is_final_positive ? "oklch(0.72 0.18 145)" : CORES_FASE[i % CORES_FASE.length];
        const leadsFase = leadsPorFase[f.slug] ?? [];
        const ehDestino = destaque === f.slug;

        return (
          <div
            key={f.id}
            onDragOver={(e) => { e.preventDefault(); setDestaque(f.slug); }}
            onDragLeave={() => destaque === f.slug && setDestaque(null)}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              setDestaque(null);
              setArrastando(null);
              if (id) void mover(id, f.slug);
            }}
            style={{
              flex: "0 0 280px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 10,
              background: ehDestino
                ? "oklch(0.7 0.18 220 / 0.08)"
                : "oklch(0.18 0.06 280 / 0.25)",
              border: ehDestino
                ? "1px dashed oklch(0.7 0.18 220 / 0.5)"
                : "1px solid oklch(0.98 0 0 / 0.06)",
              borderRadius: 12,
              minHeight: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <PontoFase label={f.label || f.slug} cor={cor} />
              <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.45)" }}>
                {leadsFase.length}
              </span>
            </div>

            {f.instruction && (
              <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.4)", lineHeight: 1.4 }}>
                {f.instruction.slice(0, 80)}
                {f.instruction.length > 80 ? "…" : ""}
              </span>
            )}

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, minHeight: 80 }}>
              {leadsFase.length === 0 ? (
                <Vazio mensagem="Vazio" pequeno />
              ) : (
                leadsFase.map((l) => (
                  <CardLead
                    key={l.id}
                    lead={l}
                    previsao={previsoes?.[l.id]}
                    arrastando={arrastando === l.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", l.id);
                      setArrastando(l.id);
                    }}
                    onDragEnd={() => setArrastando(null)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}

      {/* Coluna fantasma final pra dar respiro horizontal */}
      <div style={{ flex: "0 0 12px" }} />

      {/* Status meta — só pra debug visual */}
      {campanha.status !== "ativa" && (
        <div
          style={{
            position: "sticky",
            right: 0,
            top: 0,
            padding: 14,
            background: "oklch(0.78 0.18 80 / 0.12)",
            border: "1px solid oklch(0.78 0.18 80 / 0.4)",
            borderRadius: 12,
            fontSize: 11,
            color: "oklch(0.98 0 0 / 0.8)",
            alignSelf: "flex-start",
            maxWidth: 200,
          }}
        >
          Campanha {campanha.status === "rascunho" ? "em rascunho" : campanha.status}. Disparos pausados até ativar.
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// CardLead — card individual no Kanban
// ---------------------------------------------------------------------------

function CardLead({
  lead,
  previsao,
  arrastando,
  onDragStart,
  onDragEnd,
}: {
  lead: LeadCampanha;
  previsao?: string;
  arrastando: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [hover, setHover] = useState(false);
  const foto = lead.lead?.url_foto_perfil;
  const nome = nomeLead(lead);
  const telefone = lead.lead?.phone;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 10,
        background: "oklch(0.22 0.06 280 / 0.6)",
        border: hover
          ? "1px solid oklch(0.7 0.18 220 / 0.35)"
          : "1px solid oklch(0.98 0 0 / 0.08)",
        borderRadius: 10,
        cursor: "grab",
        opacity: arrastando ? 0.5 : 1,
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        transition: "border-color 150ms, transform 150ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {foto ? (
          <img
            src={foto}
            alt=""
            style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "oklch(0.7 0.18 220 / 0.3)",
              display: "grid",
              placeItems: "center",
              fontSize: 10,
              fontWeight: 700,
              color: "oklch(0.98 0 0)",
            }}
          >
            {nome.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 500,
            color: "oklch(0.98 0 0)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {nome}
        </span>
      </div>

      {telefone && (
        <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.5)", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
          {telefone}
        </span>
      )}

      {previsao && (
        <span
          title="Estimativa: o motor respeita a janela de horário e os tetos por hora/dia, que são do tenant e dividem com as outras campanhas ativas."
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            alignSelf: "flex-start",
            padding: "2px 7px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 600,
            color: "oklch(0.8 0.14 220)",
            background: "oklch(0.7 0.18 220 / 0.12)",
            border: "1px solid oklch(0.7 0.18 220 / 0.3)",
          }}
        >
          <Clock size={9} />
          {previsao}
        </span>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "oklch(0.98 0 0 / 0.4)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <MessageCircle size={10} />
          {lead.attempt_count} tentativa{lead.attempt_count === 1 ? "" : "s"}
        </span>
        {lead.last_contact_at && (
          <span>{formatarRel(lead.last_contact_at)}</span>
        )}
      </div>
    </div>
  );
}

function formatarRel(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  } catch {
    return "—";
  }
}
