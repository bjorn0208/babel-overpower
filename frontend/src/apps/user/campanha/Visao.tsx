/**
 * Visão de uma campanha — shell de 4 abas (Operação, Fechados, Desistentes, Config).
 *
 * Mesmo padrão estrutural do app Contratos (tabs + AnimatePresence). Carrega
 * uma vez `fases_campanha` + `leads_campanha` (com `lead:leads(...)` embed)
 * e distribui pras abas. Realtime cobre as duas tabelas.
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { duration, easing, fadeSlideIn, tapPress } from "@/os/motion/presets";

import { BotaoPausaGeral, FaixaPausado } from "./botao-pausa-geral";
import { lerPausaDisparos } from "./dados-pausa";
import {
  preverEnvios,
  rotuloQuando,
  TEXTO_SEM_PREVISAO,
  type ContagemEnvios,
} from "./previsao-envio";
import { AbaConfig } from "./visao/Config";
import { AbaDesistentes } from "./visao/Desistentes";
import { AbaFechados } from "./visao/Fechados";
import { AbaOperacao } from "./visao/Operacao";
import { PainelDisparo } from "./visao/painel-disparo";
import {
  BadgeStatus,
  BadgeTipo,
  BotaoIcone,
  BotaoStatus,
  COLUNAS_LEAD_CAMPANHA,
  type AbaVisao,
  type Campanha as CampanhaT,
  type FaseCampanha,
  type LeadCampanha,
  type SupabaseBruto,
  type ToastApi,
  proximoStatusCampanha,
} from "./re-exports";

interface Props {
  campanha: CampanhaT;
  /** Dono da conta — usado pela pausa geral e pela previsão de envio (2026-09-17). */
  ownerId?: string;
  t: ToastApi;
  onVoltar: () => void;
  onMudou: () => void;
}

export function Visao({ campanha, ownerId, t, onVoltar, onMudou }: Props) {
  const [aba, setAba] = useState<AbaVisao>("operacao");
  const [campanhaLocal, setCampanhaLocal] = useState<CampanhaT>(campanha);
  const [fases, setFases] = useState<FaseCampanha[]>([]);
  const [leads, setLeads] = useState<LeadCampanha[]>([]);
  // Δ 2026-09-17: pausa geral do tenant + contagem do que já saiu (pra previsão).
  const [pausado, setPausado] = useState(false);
  const [enviados, setEnviados] = useState<ContagemEnvios>({ hoje: 0, ultimaHora: 0 });
  const [carregando, setCarregando] = useState(true);

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------

  const carregarFases = useCallback(async () => {
    const sb = supabase as SupabaseBruto;
    const { data, error } = await sb
      .from("fases_campanha")
      .select(
        "id, campaign_id, slug, order_index, description, instruction, regra, is_final_positive, label, slots_obrigatorios, created_at",
      )
      .eq("campaign_id", campanha.id)
      .order("order_index", { ascending: true });
    if (error) {
      console.warn("[campanha] carregarFases:", error.message);
      return;
    }
    setFases((data ?? []) as FaseCampanha[]);
  }, [campanha.id]);

  const carregarLeads = useCallback(async () => {
    const sb = supabase as SupabaseBruto;
    const { data, error } = await sb
      .from("leads_campanha")
      .select(COLUNAS_LEAD_CAMPANHA)
      .eq("campaign_id", campanha.id)
      .order("entered_at", { ascending: false });
    if (error) {
      console.warn("[campanha] carregarLeads:", error.message);
      return;
    }
    setLeads((data ?? []) as LeadCampanha[]);
  }, [campanha.id]);

  useEffect(() => {
    (async () => {
      await Promise.all([carregarFases(), carregarLeads()]);
      setCarregando(false);
    })();
  }, [carregarFases, carregarLeads]);

  // -------------------------------------------------------------------------
  // Realtime — fases + leads_campanha
  // -------------------------------------------------------------------------

  useEffect(() => {
    const sb = supabase as SupabaseBruto;
    const ch = sb
      .channel(`campanha-visao-${campanha.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fases_campanha",
          filter: `campaign_id=eq.${campanha.id}`,
        },
        () => {
          void carregarFases();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads_campanha",
          filter: `campaign_id=eq.${campanha.id}`,
        },
        () => {
          void carregarLeads();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campanhas", filter: `id=eq.${campanha.id}` },
        (payload: { new: CampanhaT }) => {
          if (payload?.new) setCampanhaLocal(payload.new);
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [campanha.id, carregarFases, carregarLeads]);

  // -------------------------------------------------------------------------
  // Ações no header
  // -------------------------------------------------------------------------

  const alternarStatus = useCallback(async () => {
    const sb = supabase as SupabaseBruto;
    const { novo, bloqueio } = proximoStatusCampanha(campanhaLocal);
    if (bloqueio) {
      t.error(bloqueio);
      return;
    }
    const { error } = await sb
      .from("campanhas")
      .update({ status: novo })
      .eq("id", campanhaLocal.id);
    if (error) {
      t.error(error.message);
      return;
    }
    t.success(novo === "ativa" ? "Retomada" : "Pausada");
    setCampanhaLocal({ ...campanhaLocal, status: novo });
    onMudou();
  }, [campanhaLocal, t, onMudou]);

  const excluir = useCallback(async () => {
    if (!confirm(`Excluir "${campanhaLocal.name}"?`)) return;
    const sb = supabase as SupabaseBruto;
    const { error } = await sb.rpc("excluir_campanha", { p_campaign_id: campanhaLocal.id });
    if (error) {
      t.error(error.message);
      return;
    }
    t.success("Campanha excluída");
    onVoltar();
  }, [campanhaLocal, t, onVoltar]);

  // -------------------------------------------------------------------------
  // Filtragem de leads por estado pras abas
  // -------------------------------------------------------------------------

  // Δ 2026-09-17: previsão de envio por lead — o banco não guarda horário
  // (acoes_agendadas.scheduled_at = now()), então a estimativa é calculada aqui
  // com as mesmas regras do motor. Ver previsao-envio.ts.
  const carregarContexto = useCallback(async () => {
    const sb = supabase as SupabaseBruto;
    try {
      if (ownerId) {
        const estado = await lerPausaDisparos(ownerId);
        setPausado(estado.pausado);
      }
      const agora = new Date();
      const inicioDia = new Date(agora.getTime() - 3 * 3_600_000);
      const inicioDiaBrt = new Date(
        Date.UTC(inicioDia.getUTCFullYear(), inicioDia.getUTCMonth(), inicioDia.getUTCDate()) +
          3 * 3_600_000,
      );
      const umaHora = new Date(agora.getTime() - 3_600_000).toISOString();
      const [dia, hora] = await Promise.all([
        sb.from("leads_campanha").select("id", { count: "exact", head: true })
          .eq("campaign_id", campanha.id).gte("last_contact_at", inicioDiaBrt.toISOString()),
        sb.from("leads_campanha").select("id", { count: "exact", head: true })
          .eq("campaign_id", campanha.id).gte("last_contact_at", umaHora),
      ]);
      setEnviados({ hoje: dia?.count ?? 0, ultimaHora: hora?.count ?? 0 });
    } catch (e) {
      console.error("[campanha] não consegui montar a previsão de envio:", e);
    }
  }, [campanha.id, ownerId]);

  useEffect(() => {
    void carregarContexto();
    const id = setInterval(() => void carregarContexto(), 60_000);
    return () => clearInterval(id);
  }, [carregarContexto]);

  const leadsAtivos = leads.filter((l) => l.state === "ativo" && !l.archived_at);
  const leadsFechados = leads.filter((l) => l.state === "fechado");
  const leadsDesistentes = leads.filter((l) => l.state === "desistente");

  const previsoes: Record<string, string> = (() => {
    const fila = leadsAtivos
      .filter((l) => l.phase === "aguardando")
      .slice()
      .sort((a, b) => (a.entered_at ?? "").localeCompare(b.entered_at ?? ""));
    const agora = new Date();
    const calculadas = preverEnvios(campanhaLocal, fila.map((l) => l.id), enviados, agora, pausado);
    const mapa: Record<string, string> = {};
    for (const p of calculadas) {
      mapa[p.id] = p.quando
        ? `sai ${rotuloQuando(p.quando, agora)}`
        : TEXTO_SEM_PREVISAO[p.motivo ?? "janela_impossivel"];
    }
    return mapa;
  })();

  const abas: Array<{ id: AbaVisao; rotulo: string; cont: number }> = [
    { id: "operacao", rotulo: "Operação", cont: leadsAtivos.length },
    { id: "fechados", rotulo: "Fechados", cont: leadsFechados.length },
    { id: "desistentes", rotulo: "Desistentes", cont: leadsDesistentes.length },
    { id: "config", rotulo: "Configuração", cont: 0 },
  ];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------


  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ display: "flex", flexDirection: "column", height: "100%", gap: 14 }}
    >
      {/* Cabeçalho da campanha */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={onVoltar}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "6px 12px",
            fontSize: 12,
            color: "oklch(0.98 0 0 / 0.7)",
            background: "oklch(0.98 0 0 / 0.04)",
            border: "1px solid oklch(0.98 0 0 / 0.08)",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={14} />
          Campanhas
        </motion.button>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "oklch(0.98 0 0)",
                margin: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {campanhaLocal.name}
            </h2>
            <BadgeStatus s={campanhaLocal.status} />
            <BadgeTipo t={campanhaLocal.type} />
          </div>
          {campanhaLocal.objective && (
            <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)" }}>
              {campanhaLocal.objective}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {ownerId && (
            <BotaoPausaGeral
              tenantId={ownerId}
              t={t}
              aoMudar={(p) => setPausado(p)}
            />
          )}
          <BotaoStatus status={campanhaLocal.status} onClick={alternarStatus} />
          <BotaoIcone onClick={excluir} titulo="Excluir" perigo>
            <Trash2 size={14} />
          </BotaoIcone>
        </div>
      </div>

      {pausado && <FaixaPausado />}
      <PainelDisparo campanha={campanhaLocal} />

      {/* Tabs */}
      <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.98 0 0 / 0.08)" }}>
        {abas.map((a) => {
          const on = aba === a.id;
          return (
            <motion.button
              key={a.id}
              type="button"
              whileTap={tapPress}
              onClick={() => setAba(a.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                fontSize: 12,
                fontWeight: on ? 600 : 500,
                color: on ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.55)",
                background: on
                  ? "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.12), oklch(0.65 0.22 280 / 0.08))"
                  : "transparent",
                border: "none",
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottom: on ? "2px solid oklch(0.7 0.18 220)" : "2px solid transparent",
                cursor: "pointer",
                transition: `color ${duration.normal} ${easing.glass}`,
              }}
            >
              {a.rotulo}
              {a.cont > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    padding: "1px 6px",
                    borderRadius: 999,
                    background: on ? "oklch(0.98 0 0 / 0.15)" : "oklch(0.98 0 0 / 0.07)",
                  }}
                >
                  {a.cont}
                </span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {carregando ? (
          <div style={{ padding: 48, color: "oklch(0.98 0 0 / 0.5)", fontSize: 12 }}>
            Carregando…
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {aba === "operacao" && (
              <AbaOperacao
                key="o"
                campanha={campanhaLocal}
                fases={fases}
                leads={leadsAtivos}
                previsoes={previsoes}
                t={t}
                onMudou={() => {
                  void carregarLeads();
                }}
              />
            )}
            {aba === "fechados" && <AbaFechados key="f" leads={leadsFechados} />}
            {aba === "desistentes" && <AbaDesistentes key="d" leads={leadsDesistentes} />}
            {aba === "config" && (
              <AbaConfig
                key="c"
                campanha={campanhaLocal}
                t={t}
                onSalvou={(c) => {
                  setCampanhaLocal(c);
                  onMudou();
                }}
              />
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}

export type { Props as PropsVisao };
