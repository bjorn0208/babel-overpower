/**
 * App Consulta — shell modular
 *
 * Gerencia estado global, carregamento de dados, realtime e render das abas.
 *
 * Módulos:
 *   tipos.ts            — interfaces + helpers + inputStyle
 *   ui-consulta.tsx     — Campo, Vazio, CardKpi, BotaoIcone, FiltroPilulas, Linha
 *   re-exports.ts       — barrel
 *   aba-consultar.tsx   — vitrine de tipos + execução por documento
 *   aba-vender.tsx      — gerador de link de venda
 *   aba-historico.tsx   — histórico com filtros + expansão + ações
 *   aba-carteira.tsx    — saldo + pacotes + extrato
 *   detalhe-consulta.tsx — painel expandido + spinner Carregando
 */

import { useCallback, useEffect, useState } from "react";
import { obterTenantId } from "@/data/tenant-atual";
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { duration, easing, fadeSlideIn, tapPress } from "@/os/motion/presets";
import { AbaConsultar } from "./aba-consultar";
import { AbaHistorico, Carregando } from "./aba-historico";
import { AbaCarteira } from "./aba-carteira";
import { AbaAgente } from "./aba-agente";
import { pegarToast } from "./re-exports";
import type {
  Aba,
  Consulta as TConsulta,
  MovimentoCarteira,
  PacoteCredito,
  SupabaseBruto,
  TipoConsulta,
} from "./tipos";

export function Consulta() {
  const t = pegarToast();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("consultar");
  useAbaAlvo("consulta", (v) => setAba(v as Aba));
  const [tipos, setTipos] = useState<TipoConsulta[]>([]);
  const [consultas, setConsultas] = useState<TConsulta[]>([]);
  const [saldo, setSaldo] = useState(0);
  const [movimentos, setMovimentos] = useState<MovimentoCarteira[]>([]);
  const [pacotes, setPacotes] = useState<PacoteCredito[]>([]);
  const [carregando, setCarregando] = useState(true);

  // ---------------------------------------------------------------------------
  // Loaders — cada um marca TODO(banco) e seta [] / 0 por ora
  // ---------------------------------------------------------------------------

  const carregarTipos = useCallback(async (_uid: string) => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("consultas_tipos")
      .select("*")
      .eq("ativo", true)
      .is("deleted_at", null)
      .order("ordem");
    setTipos((data ?? []) as TipoConsulta[]);
  }, []);

  const carregarConsultas = useCallback(async (uid: string) => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("consultas")
      .select("*, lead:leads(name, nome_exibicao, phone, url_foto_perfil)")
      .eq("tenant_id", uid)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setConsultas((data ?? []) as TConsulta[]);
  }, []);

  const carregarSaldo = useCallback(async (uid: string) => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("consultas_saldo")
      .select("saldo")
      .eq("tenant_id", uid)
      .maybeSingle();
    setSaldo(Number(data?.saldo ?? 0));
  }, []);

  const carregarMovimentos = useCallback(async (uid: string) => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("consultas_carteira_mov")
      .select("*")
      .eq("tenant_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);
    setMovimentos((data ?? []) as MovimentoCarteira[]);
  }, []);

  const carregarPacotes = useCallback(async (_uid: string) => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("consultas_pacotes")
      .select("*")
      .eq("ativo", true)
      .is("deleted_at", null)
      .order("ordem");
    setPacotes((data ?? []) as PacoteCredito[]);
  }, []);

  // ---------------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------------

  useEffect(() => {
    (async () => {
      // Δ 2026-09-17: era o `uid` do logado. Membro de equipe via lista vazia e
      // gravava com o id dele (invisível pro dono). Agora usa o dono da conta.
      const uid = await obterTenantId();
      if (!uid) { setCarregando(false); return; }
      setOwnerId(uid);
      await Promise.all([
        carregarTipos(uid),
        carregarConsultas(uid),
        carregarSaldo(uid),
        carregarMovimentos(uid),
        carregarPacotes(uid),
      ]);
      setCarregando(false);
    })();
  }, [carregarTipos, carregarConsultas, carregarSaldo, carregarMovimentos, carregarPacotes]);

  // ---------------------------------------------------------------------------
  // Realtime — cleanup obrigatório no unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!ownerId) return;
    const sb = supabase as SupabaseBruto;

    // TODO(banco): realtime em consultas WHERE tenant_id=ownerId
    // TODO(banco): realtime em consultas_saldo WHERE tenant_id=ownerId
    const ch = sb
      .channel(`consulta-${ownerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "consultas",
          filter: `tenant_id=eq.${ownerId}`,
        },
        () => {
          void carregarConsultas(ownerId);
          void carregarSaldo(ownerId);
          void carregarMovimentos(ownerId);
        },
      )
      .subscribe();

    return () => { sb.removeChannel(ch); };
  }, [ownerId, carregarConsultas, carregarSaldo, carregarMovimentos]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const abas: Array<{ id: Aba; rotulo: string }> = [
    { id: "consultar", rotulo: "Consultar" },
    { id: "configuracoes", rotulo: "Configurações" },
    { id: "carteira", rotulo: "Carteira" },
    { id: "historico", rotulo: "Histórico" },
  ];

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", height: "100%", padding: 18 }}
    >
      <nav
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid oklch(0.98 0 0 / 0.08)",
          marginBottom: 16,
        }}
      >
        {abas.map((a) => {
          const ativa = aba === a.id;
          return (
            <motion.button
              key={a.id}
              type="button"
              whileTap={tapPress}
              onClick={() => setAba(a.id)}
              style={{
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: ativa ? 600 : 500,
                color: ativa ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.55)",
                background: ativa
                  ? "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.12), oklch(0.65 0.22 280 / 0.08))"
                  : "transparent",
                border: "none",
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottom: ativa
                  ? "2px solid oklch(0.7 0.18 220)"
                  : "2px solid transparent",
                cursor: "pointer",
                transition: `color ${duration.normal} ${easing.glass}`,
              }}
            >
              {a.rotulo}
            </motion.button>
          );
        })}
      </nav>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {carregando ? (
          <Carregando />
        ) : (
          <AnimatePresence mode="wait">
            {aba === "consultar" && (
              <AbaConsultar
                key="consultar"
                tipos={tipos}
                saldo={saldo}
                t={t}
              />
            )}
            {aba === "historico" && (
              <AbaHistorico
                key="historico"
                consultas={consultas}
                t={t}
                onMudou={() => {
                  if (ownerId) {
                    void carregarConsultas(ownerId);
                    void carregarSaldo(ownerId);
                    void carregarMovimentos(ownerId);
                  }
                }}
              />
            )}
            {aba === "carteira" && (
              <AbaCarteira
                key="carteira"
                saldo={saldo}
                pacotes={pacotes}
                movimentos={movimentos}
                t={t}
              />
            )}
            {aba === "configuracoes" && (
              <AbaAgente key="configuracoes" tipos={tipos} t={t} />
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}

export default Consulta;
