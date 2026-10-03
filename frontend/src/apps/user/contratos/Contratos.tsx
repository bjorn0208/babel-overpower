/**
 * App Contratos — shell modular (Onda 1 refactor, 2026-05-16)
 *
 * Monolito 943 linhas dividido em módulos ≤300 linhas cada.
 * Shell cuida apenas de: estado global, carregamento de dados,
 * realtime e render das abas.
 *
 * Módulos:
 *   tipos.ts               — interfaces + helpers de dados + inputStyle
 *   ui-contratos.tsx       — Campo, Vazio, CardKpi, BotaoIcone, FiltroPilulas, Linha
 *   re-exports.ts          — barrel (evita imports duplicados nas abas)
 *   aba-historico.tsx      — Histórico com filtros + expansão + ações
 *   aba-gerador.tsx        — Gerador de contrato livre
 *   aba-validade.tsx       — KPIs de validade
 *   aba-templates.tsx      — Lista de templates + editor WYSIWYG (montador)
 *   montador/
 *     montador-dom.ts      — helpers DOM: toHTML/toStorage/renderEditor/esc/humanize
 *     paineis-pagamento.ts — painéis inline à vista / parcelado
 *     sidebar-campos.tsx   — sidebar: criar campo, automático, seções
 *     painel-montador.tsx  — editor contentEditable WYSIWYG
 */

import { useCallback, useEffect, useState } from "react";
import { obterTenantId } from "@/data/tenant-atual";
import { irParaAba, useAbaAlvo } from "@/os/dock/aba-alvo";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { duration, easing, fadeSlideIn, tapPress } from "@/os/motion/presets";
import { AbaGerador } from "./aba-gerador";
import { AbaHistorico, Carregando } from "./aba-historico";
import { AbaTemplates } from "./aba-templates";
import { AbaValidade } from "./aba-validade";
import { COLUNAS, pegarToast } from "./re-exports";
import type { Aba, Contrato, ProdutoResumo, SupabaseBruto, TemplateContrato } from "./tipos";

export function Contratos({ onAbrirApp }: { onAbrirApp?: (slug: string) => void } = {}) {
  const t = pegarToast();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("historico");
  useAbaAlvo("contratos", (v) => setAba(v as Aba));
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [templates, setTemplates] = useState<TemplateContrato[]>([]);
  const [produtos, setProdutos] = useState<ProdutoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregarContratos = useCallback(async (uid: string) => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("contratos")
      .select(COLUNAS)
      .eq("tenant_id", uid)
      .order("created_at", { ascending: false });
    setContratos((data ?? []) as Contrato[]);
  }, []);

  const carregarTemplates = useCallback(async (uid: string) => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("contratos_template")
      .select(
        "id, user_id, produto_id, nome, conteudo, campos_obrigatorios, " +
        "instrucao_selfie, num_testemunhas, ativo, chave_pix, link_parcelamento, " +
        "posicao_pagamento, opcoes_parcelamento, valor_a_vista, placeholders",
      )
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    setTemplates((data ?? []) as TemplateContrato[]);
  }, []);

  const carregarProdutos = useCallback(async (uid: string) => {
    const sb = supabase as SupabaseBruto;
    const { data } = await sb
      .from("produtos")
      .select("id, nome")
      .eq("user_id", uid)
      .eq("ativo", true);
    setProdutos((data ?? []) as ProdutoResumo[]);
  }, []);

  useEffect(() => {
    (async () => {
      // Δ 2026-09-17: era o `uid` do logado. Membro de equipe via lista vazia e
      // gravava com o id dele (invisível pro dono). Agora usa o dono da conta.
      const uid = await obterTenantId();
      if (!uid) { setCarregando(false); return; }
      setOwnerId(uid);
      await Promise.all([
        carregarContratos(uid),
        carregarTemplates(uid),
        carregarProdutos(uid),
      ]);
      setCarregando(false);
    })();
  }, [carregarContratos, carregarTemplates, carregarProdutos]);

  // Realtime — cleanup obrigatório no unmount
  useEffect(() => {
    if (!ownerId) return;
    const sb = supabase as SupabaseBruto;
    const ch = sb
      .channel(`contratos-${ownerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contratos", filter: `tenant_id=eq.${ownerId}` },
        () => { void carregarContratos(ownerId); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contratos_template", filter: `user_id=eq.${ownerId}` },
        () => { void carregarTemplates(ownerId); },
      )
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [ownerId, carregarContratos, carregarTemplates]);

  const abas: Array<{ id: Aba; rotulo: string }> = [
    { id: "gerador", rotulo: "Gerador" },
    { id: "templates", rotulo: "Templates" },
    { id: "historico", rotulo: "Historico" },
    { id: "validade", rotulo: "Validade" },
  ];

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", height: "100%", padding: 18 }}
    >
      <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.98 0 0 / 0.08)", marginBottom: 16 }}>
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
            {aba === "gerador" && (
              <AbaGerador
                key="g"
                ownerId={ownerId}
                templates={templates}
                produtos={produtos}
                t={t}
                onCriado={() => ownerId && carregarContratos(ownerId)}
              />
            )}
            {aba === "templates" && (
              <AbaTemplates
                key="t"
                ownerId={ownerId}
                templates={templates}
                produtos={produtos}
                t={t}
                onMudou={() => ownerId && carregarTemplates(ownerId)}
              />
            )}
            {aba === "historico" && (
              <AbaHistorico
                key="h"
                contratos={contratos}
                t={t}
                onMudou={() => ownerId && carregarContratos(ownerId)}
                onAbrirConversa={
                  onAbrirApp
                    ? (conversaId) => irParaAba("conversas", `conversa:${conversaId}`, onAbrirApp)
                    : undefined
                }
              />
            )}
            {aba === "validade" && (
              <AbaValidade key="v" contratos={contratos} />
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}

export default Contratos;
