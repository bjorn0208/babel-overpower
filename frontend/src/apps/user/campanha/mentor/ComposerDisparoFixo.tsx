/**
 * Composer de Disparo Fixo — texto/foto/vídeo agendado direto pro Z-API,
 * sem o agente reescrever nada. Generaliza o padrão já em produção do app
 * Rifas (`processar-disparos-rifa`) — mesma tabela `disparos_lead`
 * processada por `processar-disparos-lead` (cron 5min).
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { tapPress } from "@/os/motion/presets";
import { botaoPrimarioStyle, type SupabaseBruto, type ToastApi } from "../re-exports";
import { CamposConteudoDisparo } from "./CamposConteudoDisparo";
import type { ListaDisparoLead } from "./tipos";
import { useConteudoDisparo } from "./use-conteudo-disparo";

interface Props {
  lista: ListaDisparoLead;
  ownerId: string;
  t: ToastApi;
  resolverIds: () => Promise<string[]>;
  onFechar: () => void;
}

export function ComposerDisparoFixo({ lista, ownerId, t, resolverIds, onFechar }: Props) {
  const conteudo = useConteudoDisparo(ownerId, t);
  const {
    tipoConteudo,
    mensagem,
    midiaUrl,
    modoAgendamento,
    horario,
    tempoDescanso,
    precisaMidia,
  } = conteudo;
  const [totalAlvo, setTotalAlvo] = useState<number | null>(null);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const ids = await resolverIds();
        if (!cancelado) setTotalAlvo(ids.length);
      } catch {
        if (!cancelado) setTotalAlvo(null);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [resolverIds]);

  const podeCriar = mensagem.trim().length > 0 && (!precisaMidia || !!midiaUrl) && !criando;

  const criarDisparo = useCallback(async () => {
    if (!podeCriar) return;
    const confirmado = confirm(
      `Confirma o disparo fixo pra ${totalAlvo ?? "?"} lead(s)? Isso vai mandar mensagem de verdade via WhatsApp${
        modoAgendamento === "agora"
          ? " assim que o cron rodar (até 5min)."
          : ` todo dia às ${horario}.`
      }`,
    );
    if (!confirmado) return;

    setCriando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const { error } = await sb.from("disparos_lead").insert({
        tenant_id: ownerId,
        lista_disparo_id: lista.id,
        nome: `${lista.nome} — disparo fixo`,
        horario: modoAgendamento === "recorrente" ? horario : null,
        tipo_conteudo: tipoConteudo,
        mensagem: mensagem.trim(),
        midia_url: midiaUrl,
        tempo_descanso_segundos: tempoDescanso,
        ativo: true,
      });
      if (error) throw error;
      t.success(
        modoAgendamento === "agora"
          ? "Disparo agendado — sai no próximo ciclo do cron (até 5min)."
          : "Disparo recorrente ativado.",
      );
      onFechar();
    } catch (e) {
      t.error(e instanceof Error ? e.message : "Erro ao criar disparo");
    } finally {
      setCriando(false);
    }
  }, [
    podeCriar,
    totalAlvo,
    modoAgendamento,
    horario,
    ownerId,
    lista,
    tipoConteudo,
    mensagem,
    midiaUrl,
    tempoDescanso,
    t,
    onFechar,
  ]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 14,
        marginTop: 4,
        background: "oklch(0.12 0.04 280 / 0.6)",
        border: "1px solid oklch(0.7 0.18 220 / 0.3)",
        borderRadius: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.98 0 0 / 0.85)" }}>
          Disparo fixo — {lista.nome}
        </span>
        <button
          type="button"
          onClick={onFechar}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "oklch(0.98 0 0 / 0.5)",
          }}
        >
          <X size={14} />
        </button>
      </div>

      <CamposConteudoDisparo conteudo={conteudo} />

      <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)" }}>
        Alvo agora: <strong style={{ color: "oklch(0.98 0 0 / 0.85)" }}>{totalAlvo ?? "…"}</strong>{" "}
        lead(s), respeitando opt-out.
      </div>

      <motion.button
        type="button"
        whileTap={tapPress}
        onClick={criarDisparo}
        disabled={!podeCriar}
        style={{
          ...botaoPrimarioStyle,
          opacity: podeCriar ? 1 : 0.4,
          cursor: podeCriar ? "pointer" : "not-allowed",
        }}
      >
        {criando ? "Ativando…" : "Ativar disparo"}
      </motion.button>
    </div>
  );
}
