/**
 * App Financeiro — shell modular (mesmo idioma do app Consulta).
 *
 * Livro-caixa do dono alimentado pelo assistente financeiro via WhatsApp
 * (cargo Financeiro): movimentos do mês + configuração do número do dono.
 *
 * Módulos:
 *   tipos.ts           — interfaces + helpers + inputStyle
 *   aba-movimentos.tsx — resumo do mês + lista editável
 *   aba-config.tsx     — número do dono + toggle
 */

import { useCallback, useEffect, useState } from "react";
import { obterTenantId } from "@/data/tenant-atual";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { duration, easing, fadeSlideIn, tapPress } from "@/os/motion/presets";
import { AbaMovimentos } from "./aba-movimentos";
import { AbaPastas } from "./aba-pastas";
import { AbaContas } from "./aba-contas";
import { AbaReceber } from "./aba-receber";
import { AbaMetas } from "./aba-metas";
import { AbaConsultoria } from "./aba-consultoria";
import { AbaConversa } from "./aba-conversa";
import { AbaConfig } from "./aba-config";
import {
  mesAtual,
  pegarToast,
  type Aba,
  type MovimentoFinanceiro,
  type SupabaseBruto,
} from "./tipos";

export function AppFinanceiro() {
  const t = pegarToast();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("movimentos");
  const [mes, setMes] = useState<string>(mesAtual());
  const [movimentos, setMovimentos] = useState<MovimentoFinanceiro[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregarMovimentos = useCallback(async (uid: string, m: string) => {
    const sb = supabase as SupabaseBruto;
    const [ano, mm] = m.split("-").map(Number);
    const fim = `${new Date(Date.UTC(ano, mm, 1)).toISOString().slice(0, 10)}`;
    // Pagina em janelas de 1000 (limite duro do PostgREST) e checa erro: os
    // totais do mês têm que somar TODOS os movimentos, não os 500 mais recentes.
    // Em falha, avisa (toast) em vez de tratar como "mês zerado".
    const criarQuery = () => sb
      .from("movimentos_financeiros")
      .select("*, documento:documentos_financeiros(storage_path, tipo)")
      .eq("owner_id", uid)
      .is("deleted_at", null)
      .gte("data_movimento", `${m}-01`)
      .lt("data_movimento", fim)
      .order("data_movimento", { ascending: false })
      .order("criado_em", { ascending: false });
    const todos: MovimentoFinanceiro[] = [];
    for (let pagina = 0; pagina < 30; pagina++) {
      const de = pagina * 1000;
      const { data, error } = await criarQuery().range(de, de + 999);
      if (error) { pegarToast().error("Não consegui carregar os movimentos do mês."); return; }
      const linhas = (data ?? []) as MovimentoFinanceiro[];
      todos.push(...linhas);
      if (linhas.length < 1000) break;
    }
    setMovimentos(todos);
  }, []);

  useEffect(() => {
    (async () => {
      // Δ 2026-09-17: era o `uid` do logado. Membro de equipe via lista vazia e
      // gravava com o id dele (invisível pro dono). Agora usa o dono da conta.
      const uid = await obterTenantId();
      if (!uid) { setCarregando(false); return; }
      setOwnerId(uid);
      await carregarMovimentos(uid, mesAtual());
      setCarregando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recarrega ao trocar de mês
  useEffect(() => {
    if (ownerId) void carregarMovimentos(ownerId, mes);
  }, [ownerId, mes, carregarMovimentos]);

  // Realtime — o agente registra pelo WhatsApp e a lista atualiza sozinha.
  useEffect(() => {
    if (!ownerId) return;
    const sb = supabase as SupabaseBruto;
    const ch = sb
      .channel(`financeiro-${ownerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "movimentos_financeiros", filter: `owner_id=eq.${ownerId}` },
        () => { void carregarMovimentos(ownerId, mes); },
      )
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [ownerId, mes, carregarMovimentos]);

  const abas: Array<{ id: Aba; rotulo: string }> = [
    { id: "movimentos", rotulo: "Movimentos" },
    { id: "pastas", rotulo: "Pastas" },
    { id: "contas", rotulo: "Contas" },
    { id: "receber", rotulo: "A receber" },
    { id: "metas", rotulo: "Metas" },
    { id: "consultoria", rotulo: "Consultoria" },
    { id: "conversa", rotulo: "Conversa" },
    { id: "configuracoes", rotulo: "Configurações" },
  ];

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", height: "100%", padding: 18 }}
    >
      {/* overflowX + flexShrink:0 nos botões: 8 abas não cabem numa tela de
          celular — em vez de espremer o texto, a barra rola na horizontal
          (padrão de tab-bar mobile), sem precisar de wrap/redesenho. */}
      <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.98 0 0 / 0.08)", marginBottom: 16, overflowX: "auto" }}>
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
                borderBottom: ativa ? "2px solid oklch(0.7 0.18 220)" : "2px solid transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
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
          <div style={{ padding: "40px 0", textAlign: "center", color: "oklch(0.98 0 0 / 0.5)", fontSize: 13 }}>
            Carregando…
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {aba === "movimentos" && (
              <AbaMovimentos
                key="movimentos"
                ownerId={ownerId}
                movimentos={movimentos}
                mes={mes}
                setMes={setMes}
                t={t}
                onMudou={() => { if (ownerId) void carregarMovimentos(ownerId, mes); }}
              />
            )}
            {aba === "pastas" && (
              <AbaPastas key="pastas" ownerId={ownerId} movimentos={movimentos} mes={mes} t={t} />
            )}
            {aba === "contas" && (
              <AbaContas key="contas" ownerId={ownerId} t={t} />
            )}
            {aba === "receber" && (
              <AbaReceber key="receber" ownerId={ownerId} t={t} aoMudarCaixa={() => { if (ownerId) void carregarMovimentos(ownerId, mes); }} />
            )}
            {aba === "metas" && (
              <AbaMetas key="metas" ownerId={ownerId} t={t} />
            )}
            {aba === "consultoria" && (
              <AbaConsultoria key="consultoria" movimentos={movimentos} mes={mes} />
            )}
            {aba === "conversa" && (
              <AbaConversa key="conversa" ownerId={ownerId} />
            )}
            {aba === "configuracoes" && (
              <AbaConfig key="configuracoes" ownerId={ownerId} t={t} />
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}

export default AppFinanceiro;
