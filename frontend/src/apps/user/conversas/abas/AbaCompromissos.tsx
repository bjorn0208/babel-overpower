/**
 * Aba "Compromissos" — agendamentos próximos + passados.
 *
 * Fontes reais (Onda B):
 *  - compromissos_do_lead (titulo, data_iso, status, observacao)
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { fadeSlideIn, stagger, staggerItem } from "@/os/motion/presets";
import type { Compromisso, Conversa } from "../tipos";
import { enriquecerDossieViaRPC, type DossieEnriquecido } from "../hooks/useConversasLive";

interface AbaCompromissosProps {
  conversa: Conversa;
  /** UUID real da conversa quando `conversa.id` é mock. Onda 2026-05-14. */
  conversaIdOverride?: string | null;
}

/**
 * Mapeia compromissos_ativos do RPC fn_dossie_lead_consolidado pro shape Compromisso
 * usado pela UI. Status do RPC ('pendente'/'agendado'/etc) → status da UI.
 * Onda 2026-05-14.
 */
function rpcParaCompromisso(item: Record<string, unknown>): Compromisso {
  const statusRpc = String(item.status ?? "agendado");
  const status: Compromisso["status"] =
    statusRpc === "realizado" || statusRpc === "executado" || statusRpc === "concluido"
      ? "realizado"
      : statusRpc === "cancelado"
        ? "cancelado"
        : "agendado";
  return {
    id: String(item.id),
    titulo: String(item.titulo ?? `Compromisso ${item.tipo ?? ""}`).trim() || "Compromisso",
    data_iso: String(item.executar_em ?? new Date().toISOString()),
    status,
    observacao: typeof item.tipo === "string" ? `tipo: ${item.tipo}` : undefined,
  };
}

const COR_STATUS: Record<Compromisso["status"], string> = {
  agendado: "oklch(0.7 0.18 220)",
  realizado: "oklch(0.72 0.18 145)",
  cancelado: "var(--txt-3)",
};

function formatarDataCompleta(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function diasDistancia(iso: string): { texto: string; futuro: boolean } {
  const diff = new Date(iso).getTime() - Date.now();
  const dias = Math.round(diff / 86_400_000);
  if (dias === 0) return { texto: "hoje", futuro: true };
  if (dias > 0) return { texto: `em ${dias}d`, futuro: true };
  return { texto: `${-dias}d atrás`, futuro: false };
}

export function AbaCompromissos({ conversa, conversaIdOverride }: AbaCompromissosProps) {
  // Onda 2026-05-14 — RPC consolidado tem `compromissos_ativos` da view view.compromissos_ativos.
  // Quando presente, prioriza ele; senão cai no `conversa.compromissos` (legado, vazio em ChatTeste).
  const [dossie, setDossie] = useState<DossieEnriquecido | null>(null);
  const convIdEfetivo = conversaIdOverride ?? conversa.id;
  useEffect(() => {
    let ativo = true;
    const leadId = conversa.lead?.id;
    if (!leadId) return;
    enriquecerDossieViaRPC(leadId, convIdEfetivo).then((d) => {
      if (ativo && d) setDossie(d);
    });
    return () => { ativo = false; };
  }, [conversa.lead?.id, convIdEfetivo, conversa.mente.atualizado_em]);

  const lista = useMemo<Compromisso[]>(() => {
    const doRpc: Compromisso[] = (dossie?.compromissos_ativos ?? []).map(rpcParaCompromisso);
    const fonte = doRpc.length > 0 ? doRpc : conversa.compromissos;
    return [...fonte].sort(
      (a, b) => new Date(a.data_iso).getTime() - new Date(b.data_iso).getTime(),
    );
  }, [dossie?.compromissos_ativos, conversa.compromissos]);
  const futuros = lista.filter((c) => new Date(c.data_iso).getTime() >= Date.now());
  const passados = lista.filter((c) => new Date(c.data_iso).getTime() < Date.now());

  const Linha = ({ c }: { c: Compromisso }) => {
    const dd = diasDistancia(c.data_iso);
    const cor = COR_STATUS[c.status];
    return (
      <motion.li
        variants={staggerItem}
        className="row"
        style={{
          gap: 10,
          alignItems: "flex-start",
          padding: "10px 12px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: cor,
            boxShadow: `0 0 6px ${cor}/0.6`,
            marginTop: 6,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="small" style={{ fontWeight: 500 }}>{c.titulo}</div>
          <div className="muted tiny">
            {formatarDataCompleta(c.data_iso)} · {dd.texto}
          </div>
          {c.observacao && (
            <div className="muted tiny" style={{ marginTop: 4, fontStyle: "italic" }}>
              “{c.observacao}”
            </div>
          )}
        </div>
        <span
          className="badge mono tiny"
          style={{ color: cor, borderColor: cor, padding: "2px 6px", borderRadius: 999, border: `1px solid ${cor}`, background: "transparent" }}
        >
          {c.status}
        </span>
      </motion.li>
    );
  };

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", gap: 18, padding: "16px 18px" }}
    >
      <section aria-label="Compromissos futuros">
        <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
          Próximos ({futuros.length})
        </div>
        {futuros.length === 0 ? (
          <span className="muted tiny">Nenhum compromisso agendado.</span>
        ) : (
          <motion.ul
            variants={stagger(0.04, 0.02)}
            initial="hidden"
            animate="visible"
            style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}
          >
            {futuros.map((c) => <Linha key={c.id} c={c} />)}
          </motion.ul>
        )}
      </section>

      {passados.length > 0 && (
        <section aria-label="Compromissos passados">
          <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
            Histórico ({passados.length})
          </div>
          <motion.ul
            variants={stagger(0.03, 0.02)}
            initial="hidden"
            animate="visible"
            style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, opacity: 0.7 }}
          >
            {passados.map((c) => <Linha key={c.id} c={c} />)}
          </motion.ul>
        </section>
      )}
    </motion.div>
  );
}
