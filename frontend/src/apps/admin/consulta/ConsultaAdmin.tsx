/**
 * App admin de Consulta — shell com 4 seções.
 * Carregamento de dados via Supabase (TODO por tabela).
 * Seções: Tipos | API | Pacotes | Recargas.
 */

import { useState, useEffect } from "react";
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { motion, AnimatePresence } from "framer-motion";
import { fadeSlideIn, tapPress, duration, easing } from "@/os/motion/presets";
import { SecaoTipos } from "./secao-tipos";
import { SecaoApi } from "./secao-api";
import { SecaoPacotes } from "./secao-pacotes";
import { SecaoRecargas } from "./secao-recargas";
import { SecaoRagNicho } from "./secao-rag-nicho";
import { supabase } from "@/integrations/supabase/client";
import type { Secao, TipoConsulta, ConfigApi, PacoteCredito, Recarga, SupabaseBruto } from "./tipos";

// ---------------------------------------------------------------------------
// Definição das abas
// ---------------------------------------------------------------------------

const ABAS: Array<{ id: Secao; rotulo: string; descricao: string }> = [
  { id: "tipos",    rotulo: "Tipos",    descricao: "Tipos de consulta disponíveis" },
  { id: "api",      rotulo: "API",      descricao: "Configuração do provedor externo" },
  { id: "pacotes",  rotulo: "Pacotes",  descricao: "Pacotes de crédito para tenants" },
  { id: "recargas", rotulo: "Recargas", descricao: "Aprovação de recargas pendentes" },
  { id: "rag",      rotulo: "RAG",      descricao: "Conhecimento de venda por nicho" },
];

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ConsultaAdmin() {
  const [secao, setSecao] = useState<Secao>("tipos");
  useAbaAlvo("consulta-admin", (v) => setSecao(v as Secao));

  // Dados — por ora arrays/null vazios até o banco ser conectado
  const [tipos, setTipos]       = useState<TipoConsulta[]>([]);
  const [configApi, setConfigApi] = useState<ConfigApi | null>(null);
  const [pacotes, setPacotes]   = useState<PacoteCredito[]>([]);
  const [recargas, setRecargas] = useState<Recarga[]>([]);
  const [carregando, setCarregando] = useState(false);

  // Contador de recargas pendentes para badge na aba
  const qtdPendentes = recargas.filter(
    (r) => r.status === "aguardando" || r.status === "comprovante_enviado",
  ).length;

  async function carregarTodos() {
    setCarregando(true);
    try {
      const sb = supabase as SupabaseBruto;
      const [t, a, p, r] = await Promise.all([
        sb.from("consultas_tipos").select("*").is("deleted_at", null).order("ordem"),
        sb.from("consultas_config_api").select("*").limit(1).maybeSingle(),
        sb.from("consultas_pacotes").select("*").is("deleted_at", null).order("ordem"),
        sb
          .from("consultas_recargas")
          .select("*, tenant:profiles!tenant_id(full_name, avatar_url)")
          .order("created_at", { ascending: false }),
      ]);
      setTipos((t.data ?? []) as TipoConsulta[]);
      setConfigApi((a.data ?? null) as ConfigApi | null);
      setPacotes((p.data ?? []) as PacoteCredito[]);
      setRecargas((r.data ?? []) as Recarga[]);
    } catch (e) {
      console.error("Erro ao carregar configuração de Consulta:", e);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregarTodos(); }, []);

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", height: "100%", padding: 18 }}
    >
      {/* Cabeçalho da página */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "oklch(0.98 0 0)" }}>
          Consulta — Configuração
        </div>
        <div style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.5)", marginTop: 3 }}>
          Gerencie tipos de consulta, API externa, pacotes de crédito e aprovação de recargas.
        </div>
      </div>

      {/* Nav de abas */}
      <nav
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid oklch(0.98 0 0 / 0.08)",
          marginBottom: 20,
        }}
      >
        {ABAS.map((a) => {
          const ativa = secao === a.id;
          const temBadge = a.id === "recargas" && qtdPendentes > 0;
          return (
            <motion.button
              key={a.id}
              type="button"
              whileTap={tapPress}
              onClick={() => setSecao(a.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
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
              {temBadge && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 999,
                    background: "oklch(0.78 0.18 80)",
                    color: "oklch(0.12 0.04 280)",
                    lineHeight: 1.6,
                  }}
                >
                  {qtdPendentes}
                </span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Conteúdo da seção */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {carregando ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 120,
              fontSize: 12,
              color: "oklch(0.98 0 0 / 0.4)",
            }}
          >
            Carregando…
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {secao === "tipos" && (
              <SecaoTipos
                key="tipos"
                tipos={tipos}
                onMudou={carregarTodos}
              />
            )}
            {secao === "api" && (
              <SecaoApi
                key="api"
                config={configApi}
                onMudou={carregarTodos}
              />
            )}
            {secao === "pacotes" && (
              <SecaoPacotes
                key="pacotes"
                pacotes={pacotes}
                onMudou={carregarTodos}
              />
            )}
            {secao === "recargas" && (
              <SecaoRecargas
                key="recargas"
                recargas={recargas}
                onMudou={carregarTodos}
              />
            )}
            {secao === "rag" && <SecaoRagNicho key="rag" />}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}

export default ConsultaAdmin;
