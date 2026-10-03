/**
 * App Campanha — shell modular (núcleo essencial, 2026-05-26).
 *
 * Mesmo padrão do app Contratos (`apps/user/contratos/Contratos.tsx`): shell
 * cuida apenas de estado global, carga de dados, realtime e roteamento entre
 * 3 modos — Lista, Wizard de criação, Visão de detalhe (1 campanha por vez).
 *
 * Banco: lê de `campanhas` + agrega contagem de `leads_campanha` por
 * campaign_id em 1 round-trip pra KPI inline. Realtime nas duas tabelas.
 *
 * Escopo cravado com Theus em 2026-05-26: lista + wizard + visão 4 abas.
 * Editor de Fases, A/B, Indicador, Reproposta ficam pro módulo completo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { BotaoPausaGeral } from "./botao-pausa-geral";
import { AnimatePresence, motion } from "framer-motion";
import { Compass, Megaphone, Plus, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { duration, easing, fadeSlideIn, tapPress } from "@/os/motion/presets";

import { LinhaCampanha } from "./lista-linha";
import {
  BadgeStatus,
  BadgeTipo,
  CardKpi,
  COLUNAS_LISTAGEM,
  Vazio,
  type Campanha as CampanhaT,
  type FiltroStatus,
  type FiltroTipo,
  type KpiCampanha,
  type LeadCampanha,
  type StatusCampanha,
  type SupabaseBruto,
  badgeStatus,
  inputStyle,
  pegarToast,
  proximoStatusCampanha,
} from "./re-exports";
import { Mentor } from "./mentor/Mentor";
import { Visao } from "./Visao";
import type { EstadoStep2 } from "./wizard/Step2Publico";
import { Wizard } from "./wizard/Wizard";

type Modo = "lista" | "wizard" | "visao" | "mentor";

export function Campanha() {
  const t = pegarToast();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("lista");
  const [campanhaAtiva, setCampanhaAtiva] = useState<CampanhaT | null>(null);
  const [publicoPreSeed, setPublicoPreSeed] = useState<Partial<EstadoStep2> | undefined>(undefined);
  const [campanhas, setCampanhas] = useState<CampanhaT[]>([]);
  const [leadsPorCampanha, setLeadsPorCampanha] = useState<Record<string, LeadCampanha[]>>({});
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todas");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [carregando, setCarregando] = useState(true);

  // -------------------------------------------------------------------------
  // Carga inicial — campanhas + leads_campanha agrupados
  // -------------------------------------------------------------------------

  const carregarCampanhas = useCallback(async (uid: string) => {
    const sb = supabase as SupabaseBruto;
    const { data, error } = await sb
      .from("campanhas")
      .select(COLUNAS_LISTAGEM)
      .eq("tenant_id", uid)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[campanha] carregarCampanhas:", error.message);
      return;
    }
    setCampanhas((data ?? []) as CampanhaT[]);
  }, []);

  const carregarLeads = useCallback(async (campaignIds: string[]) => {
    if (campaignIds.length === 0) {
      setLeadsPorCampanha({});
      return;
    }
    const sb = supabase as SupabaseBruto;
    // Chunk de 200 IDs (R5 bug histórico em postgrest URL limit).
    const chunks: string[][] = [];
    for (let i = 0; i < campaignIds.length; i += 200) {
      chunks.push(campaignIds.slice(i, i + 200));
    }
    const todos: LeadCampanha[] = [];
    for (const chunk of chunks) {
      const { data, error } = await sb
        .from("leads_campanha")
        .select("id, campaign_id, state, last_contact_at, archived_at")
        .in("campaign_id", chunk)
        .is("archived_at", null);
      if (error) {
        console.warn("[campanha] carregarLeads:", error.message);
        continue;
      }
      todos.push(...((data ?? []) as LeadCampanha[]));
    }
    const agrupado: Record<string, LeadCampanha[]> = {};
    for (const l of todos) {
      (agrupado[l.campaign_id] ??= []).push(l);
    }
    setLeadsPorCampanha(agrupado);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getSession();
      const uid = u?.session?.user?.id;
      if (!uid) {
        setCarregando(false);
        return;
      }
      // Membro de equipe: campanhas, listas de disparo e o canal Z-API são do
      // dono da conta. Sem resolver `parent_user_id`, o app fica vazio e o
      // disparo do Mentor nunca sai (buscava pelo uid do membro). `ownerId`
      // resolvido aqui propaga pra Mentor/Wizard/Visão.
      const sb = supabase as SupabaseBruto;
      const { data: perfil } = await sb
        .from("profiles")
        .select("parent_user_id")
        .eq("id", uid)
        .maybeSingle();
      const dono = (perfil?.parent_user_id as string | null) ?? uid;
      setOwnerId(dono);
      await carregarCampanhas(dono);
      setCarregando(false);
    })();
  }, [carregarCampanhas]);

  useEffect(() => {
    if (campanhas.length === 0) {
      setLeadsPorCampanha({});
      return;
    }
    void carregarLeads(campanhas.map((c) => c.id));
  }, [campanhas, carregarLeads]);

  // -------------------------------------------------------------------------
  // Realtime — cleanup obrigatório no unmount
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!ownerId) return;
    const sb = supabase as SupabaseBruto;
    const ch = sb
      .channel(`campanha-${ownerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campanhas", filter: `tenant_id=eq.${ownerId}` },
        () => {
          void carregarCampanhas(ownerId);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "leads_campanha" }, () => {
        if (campanhas.length > 0) void carregarLeads(campanhas.map((c) => c.id));
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [ownerId, carregarCampanhas, carregarLeads, campanhas]);

  // -------------------------------------------------------------------------
  // Métricas globais + filtragem
  // -------------------------------------------------------------------------

  const totaisGlobais = useMemo(() => {
    let leadsAtivos = 0;
    let leadsFechados = 0;
    let leadsDesistentes = 0;
    let campanhasAtivas = 0;
    for (const c of campanhas) {
      if (c.status === "ativa") campanhasAtivas += 1;
      const leads = leadsPorCampanha[c.id] ?? [];
      for (const l of leads) {
        if (l.state === "ativo") leadsAtivos += 1;
        else if (l.state === "fechado") leadsFechados += 1;
        else leadsDesistentes += 1;
      }
    }
    return {
      campanhasAtivas,
      campanhasTotal: campanhas.length,
      leadsAtivos,
      leadsFechados,
      leadsDesistentes,
    };
  }, [campanhas, leadsPorCampanha]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return campanhas.filter((c) => {
      if (filtroStatus !== "todas" && c.status !== filtroStatus) return false;
      if (filtroTipo !== "todos" && c.type !== filtroTipo) return false;
      if (termo && !`${c.name} ${c.description} ${c.objective}`.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [campanhas, busca, filtroStatus, filtroTipo]);

  // -------------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------------

  const alternarStatus = useCallback(
    async (c: CampanhaT) => {
      const sb = supabase as SupabaseBruto;
      const { novo, bloqueio } = proximoStatusCampanha(c);
      if (bloqueio) {
        t.error(bloqueio);
        return;
      }
      const { error } = await sb.from("campanhas").update({ status: novo }).eq("id", c.id);
      if (error) {
        t.error(error.message);
        return;
      }
      t.success(novo === "ativa" ? "Campanha retomada" : "Campanha pausada");
      if (ownerId) void carregarCampanhas(ownerId);
    },
    [ownerId, carregarCampanhas, t],
  );

  const excluir = useCallback(
    async (c: CampanhaT) => {
      if (
        !confirm(
          `Excluir "${c.name}"? Os leads ativos viram desistentes (motivo: campanha_deletada).`,
        )
      )
        return;
      const sb = supabase as SupabaseBruto;
      // RPC vivo no banco: faz soft-delete em cascata
      const { error } = await sb.rpc("excluir_campanha", { p_campaign_id: c.id });
      if (error) {
        t.error(error.message);
        return;
      }
      t.success("Campanha excluída");
      if (ownerId) void carregarCampanhas(ownerId);
    },
    [ownerId, carregarCampanhas, t],
  );

  const abrirVisao = useCallback((c: CampanhaT) => {
    setCampanhaAtiva(c);
    setModo("visao");
  }, []);

  const voltarLista = useCallback(() => {
    setCampanhaAtiva(null);
    setPublicoPreSeed(undefined);
    setModo("lista");
    if (ownerId) void carregarCampanhas(ownerId);
  }, [ownerId, carregarCampanhas]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (carregando) {
    return (
      <div style={{ padding: 48, color: "oklch(0.98 0 0 / 0.5)", fontSize: 12 }}>
        Carregando campanhas…
      </div>
    );
  }

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", height: "100%", padding: 18 }}
    >
      <AnimatePresence mode="wait">
        {modo === "wizard" && ownerId && (
          <Wizard
            key="w"
            ownerId={ownerId}
            t={t}
            onCancelar={voltarLista}
            onCriado={(criada) => {
              // Δ 2026-09-17 (Theus): cai direto na esteira da campanha criada.
              if (ownerId) void carregarCampanhas(ownerId);
              setPublicoPreSeed(undefined);
              abrirVisao(criada);
            }}
            estadoInicialPublico={publicoPreSeed}
          />
        )}

        {modo === "mentor" && ownerId && (
          <Mentor
            key="m"
            ownerId={ownerId}
            t={t}
            onVoltar={() => setModo("lista")}
            onMandarAgente={(estadoPublico) => {
              setPublicoPreSeed(estadoPublico);
              setModo("wizard");
            }}
          />
        )}

        {modo === "visao" && campanhaAtiva && ownerId && (
          <Visao
            key={`v-${campanhaAtiva.id}`}
            campanha={campanhaAtiva}
            ownerId={ownerId}
            t={t}
            onVoltar={voltarLista}
            onMudou={() => ownerId && carregarCampanhas(ownerId)}
          />
        )}

        {modo === "lista" && (
          <motion.div
            key="l"
            variants={fadeSlideIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Megaphone size={20} style={{ color: "oklch(0.7 0.18 220)" }} />
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "oklch(0.98 0 0)" }}>
                  Campanhas
                </h2>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {/* Δ 2026-09-17 (Theus): freio de mão de tudo, na frente. */}
                {ownerId && <BotaoPausaGeral tenantId={ownerId} t={t} />}
                <motion.button
                  type="button"
                  whileTap={tapPress}
                  onClick={() => {
                    setPublicoPreSeed(undefined);
                    setModo("mentor");
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: "oklch(0.98 0 0 / 0.06)",
                    color: "oklch(0.98 0 0 / 0.85)",
                    border: "1px solid oklch(0.98 0 0 / 0.14)",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  <Compass size={14} />
                  Mentor
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={tapPress}
                  onClick={() => {
                    setPublicoPreSeed(undefined);
                    setModo("wizard");
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    background:
                      "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.5), oklch(0.65 0.22 280 / 0.4))",
                    color: "oklch(0.98 0 0)",
                    border: "1px solid oklch(0.7 0.18 220 / 0.6)",
                    borderRadius: 10,
                    cursor: "pointer",
                    transition: `transform ${duration.fast} ${easing.outExpo}`,
                  }}
                >
                  <Plus size={14} />
                  Nova campanha
                </motion.button>
              </div>
            </div>

            {/* KPIs globais */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              <CardKpi
                rotulo="Ativas"
                valor={totaisGlobais.campanhasAtivas}
                cor="oklch(0.72 0.18 145)"
                sufixo={`/${totaisGlobais.campanhasTotal}`}
              />
              <CardKpi
                rotulo="Leads ativos"
                valor={totaisGlobais.leadsAtivos}
                cor="oklch(0.7 0.18 220)"
              />
              <CardKpi
                rotulo="Fechados"
                valor={totaisGlobais.leadsFechados}
                cor="oklch(0.65 0.22 280)"
              />
              <CardKpi
                rotulo="Desistentes"
                valor={totaisGlobais.leadsDesistentes}
                cor="oklch(0.65 0.24 25)"
              />
            </div>

            {/* Filtros */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
                <Search
                  size={12}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "oklch(0.98 0 0 / 0.45)",
                  }}
                />
                <input
                  type="text"
                  placeholder="Buscar campanha…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  style={{ ...inputStyle, paddingLeft: 32 }}
                />
              </div>
              <SeletorStatus ativo={filtroStatus} onChange={setFiltroStatus} />
              <SeletorTipo ativo={filtroTipo} onChange={setFiltroTipo} />
            </div>

            {/* Lista */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 0,
              }}
            >
              {filtradas.length === 0 ? (
                <Vazio
                  mensagem={
                    campanhas.length === 0
                      ? "Nenhuma campanha criada ainda. Clica em Nova campanha pra começar."
                      : "Nada bate com os filtros."
                  }
                  icone={Megaphone}
                />
              ) : (
                filtradas.map((c) => (
                  <LinhaCampanha
                    key={c.id}
                    campanha={c}
                    leads={leadsPorCampanha[c.id] ?? []}
                    onAbrir={() => abrirVisao(c)}
                    onAlternarStatus={() => alternarStatus(c)}
                    onExcluir={() => excluir(c)}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Seletores compactos de filtro (inline pra manter shell autossuficiente)
// ---------------------------------------------------------------------------

function SeletorStatus({
  ativo,
  onChange,
}: {
  ativo: FiltroStatus;
  onChange: (v: FiltroStatus) => void;
}) {
  const opcoes: FiltroStatus[] = ["todas", "rascunho", "ativa", "pausada", "finalizada"];
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {opcoes.map((op) => {
        const on = ativo === op;
        const rotulo = op === "todas" ? "Todas" : badgeStatus(op as StatusCampanha).rotulo;
        return (
          <button
            key={op}
            type="button"
            onClick={() => onChange(op)}
            style={{
              padding: "5px 10px",
              fontSize: 10,
              fontWeight: 500,
              background: on ? "oklch(0.7 0.18 220 / 0.25)" : "oklch(0.98 0 0 / 0.04)",
              color: on ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.55)",
              border: on
                ? "1px solid oklch(0.7 0.18 220 / 0.5)"
                : "1px solid oklch(0.98 0 0 / 0.06)",
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}

function SeletorTipo({
  ativo,
  onChange,
}: {
  ativo: FiltroTipo;
  onChange: (v: FiltroTipo) => void;
}) {
  const opcoes: Array<{ id: FiltroTipo; rotulo: string }> = [
    { id: "todos", rotulo: "Todos" },
    { id: "divulgacao", rotulo: "Divulgação" },
    { id: "venda", rotulo: "Venda" },
    { id: "pos_venda", rotulo: "Pós-venda" },
    { id: "cobranca", rotulo: "Cobrança" },
    { id: "agendamento", rotulo: "Agendamento" },
    { id: "indicacao", rotulo: "Indicação" },
  ];
  return (
    <select
      value={ativo}
      onChange={(e) => onChange(e.target.value as FiltroTipo)}
      style={{ ...inputStyle, width: 160, fontSize: 11 }}
    >
      {opcoes.map((op) => (
        <option key={op.id} value={op.id} style={{ background: "oklch(0.18 0.06 280)" }}>
          {op.rotulo}
        </option>
      ))}
    </select>
  );
}

// Exports auxiliares (silenciar tree-shake)
export { BadgeStatus, BadgeTipo };
export type { KpiCampanha };

export default Campanha;
