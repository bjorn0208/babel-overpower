// @ts-nocheck
// Aba 14 — Cross-Nicho
// Vitrine do fosso. Funil de desfecho + candidatos cross-tenant + banners para B3/B5.
// Banco real: leads.desfecho (contagem) + candidatos_bloco via useCandidatosBloco.
// perfil_empresa (B3) e comparativo_nicho (B5) ainda não existem — banners informativos.

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useTenantImpersonado } from "../dados/contexto-curadoria";
import { useCandidatosBloco } from "../dados/use-candidatos-bloco";
import { useCrossNicho } from "../dados/use-cross-nicho";
import { TENANT_UNIVERSO } from "../dados/tipos";
import {
  useFunilDesfecho,
  CardDesfecho,
  FunilVisual,
  TabCandidatos,
} from "../componentes/funil-desfecho";

export function AbaCrossNicho() {
  const tenant = useTenantImpersonado();
  const tenantId = tenant.id === TENANT_UNIVERSO.id ? null : tenant.id;

  const { funil, status: statusFunil } = useFunilDesfecho(tenantId);
  const { candidatos } = useCandidatosBloco();
  const cross = useCrossNicho(tenantId);
  const [destilando, setDestilando] = useState(false);

  const [tab, setTab] = useState<"funil" | "perfil_empresa" | "comparativo" | "candidatos">("funil");

  const pendentesCount = candidatos.filter((c) => c.status === "pendente").length;
  const totalFunil = funil.reduce((a, b) => a + b.count, 0);

  const TABS = [
    { id: "funil" as const,          label: "Funil de desfecho",   count: totalFunil > 0 ? totalFunil : null },
    { id: "perfil_empresa" as const, label: "Perfil empresa",       count: "B3" },
    { id: "comparativo" as const,    label: "Comparativo nicho",    count: "B5" },
    { id: "candidatos" as const,     label: "Candidatos pendentes", count: pendentesCount > 0 ? pendentesCount : null },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="px-5 py-3 border-b border-borda flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="h3">Cross-Nicho</div>
          <div className="small muted mt-0.5">
            Vitrine do fosso. Destila perfil_empresa, agrega comparativo_nicho (k-anon + ε),
            aprova candidatos cross-tenant.
          </div>
        </div>
        <div className="row gap-2 shrink-0">
          <button
            className="btn btn-ghost btn-sm"
            disabled={!tenantId || destilando}
            onClick={async () => {
              setDestilando(true);
              try { await cross.destilar(); } finally { setDestilando(false); }
            }}
            title={tenantId ? "Destilar perfil_empresa do tenant" : "Selecione um tenant"}
          >
            <Icon name="refresh" size={14} />
            {destilando ? "destilando…" : "destilar agora"}
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="px-5 flex gap-4 border-b border-borda shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="pb-2.5 text-sm border-b-2 transition-colors flex items-center gap-1.5 -mb-px"
            style={
              tab === t.id
                ? { borderColor: "var(--os-acento-1)", color: "var(--os-txt)" }
                : { borderColor: "transparent", color: "var(--os-txt3)" }
            }
          >
            {t.label}
            {t.count != null && (
              <span className="tiny mono muted">· {t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* conteúdo */}
      <div className="flex-1 overflow-auto p-5">

        {/* ── Funil ── */}
        {tab === "funil" && (
          <div className="space-y-4">
            {!tenantId && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 muted">
                <Icon name="bar-chart" size={28} />
                <span className="small">Selecione um tenant para ver o funil</span>
              </div>
            )}

            {tenantId && statusFunil === "carregando" && (
              <div className="muted small">Carregando funil…</div>
            )}

            {tenantId && statusFunil === "ok" && (
              <>
                <div className="grid grid-cols-4 gap-3">
                  {funil.map((d) => <CardDesfecho key={d.estado} d={d} />)}
                </div>

                <div className="os-card p-4">
                  <div className="tiny uppercase text-txt3 tracking-wide mb-4">Funil visual</div>
                  <FunilVisual funil={funil} />
                </div>

                <div className="os-card p-4">
                  <div className="tiny uppercase text-txt3 tracking-wide mb-3">
                    Tempo médio entre estados
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { titulo: "em_aberto → convertido", valor: "—", sub: "mediana (sem dados)" },
                      { titulo: "em_aberto → perdido",    valor: "—", sub: "mediana (sem dados)" },
                      { titulo: "em_aberto → sumiu",      valor: "—", sub: "cutoff de inatividade" },
                      { titulo: "recuperações",            valor: "—", sub: "sumiu → convertido" },
                    ].map(({ titulo, valor, sub }) => (
                      <div key={titulo} className="os-card p-3">
                        <div className="tiny uppercase text-txt3">{titulo}</div>
                        <div className="text-lg font-medium mt-1 tabular-nums muted">{valor}</div>
                        <div className="tiny muted mt-0.5">{sub}</div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="mt-3 rounded-lg px-3 py-2 small"
                    style={{
                      background: "oklch(0.55 0.14 250 / 0.08)",
                      border: "1px solid oklch(0.55 0.14 250 / 0.20)",
                      color: "oklch(0.75 0.08 250)",
                    }}
                  >
                    <Icon name="info" size={12} className="inline mr-1.5" />
                    Métricas de tempo requerem query de janela temporal — disponíveis após view{" "}
                    <span className="mono">vw_funil_desfecho</span> ser criada (Onda D).
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Perfil empresa — REAL (Trilho B3) ── */}
        {tab === "perfil_empresa" && (
          <div className="space-y-4">
            {!tenantId && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 muted">
                <Icon name="users" size={28} />
                <span className="small">Selecione um tenant para ver o perfil destilado</span>
              </div>
            )}
            {tenantId && cross.status === "carregando" && (
              <div className="muted small">carregando perfil_empresa…</div>
            )}
            {tenantId && cross.status === "ok" && !cross.perfilEmpresa && (
              <div className="os-card p-6 flex flex-col items-center gap-3 text-center muted">
                <Icon name="info" size={28} />
                <div className="small font-medium">Tenant ainda não foi destilado</div>
                <div className="tiny max-w-md">
                  Clique em <strong>destilar agora</strong> no topo pra rodar a função{" "}
                  <span className="mono">destilar_perfil_empresa(tenant_id)</span> e popular esta aba.
                  Roda automaticamente todo domingo 04:00 UTC.
                </div>
              </div>
            )}
            {tenantId && cross.status === "ok" && cross.perfilEmpresa && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="os-card p-3">
                    <div className="tiny uppercase text-txt3">Segmento</div>
                    <div className="small font-medium mt-1">{cross.perfilEmpresa.segmento ?? "—"}</div>
                  </div>
                  <div className="os-card p-3">
                    <div className="tiny uppercase text-txt3">Taxa conversão</div>
                    <div className="text-lg font-semibold mt-1 tabular-nums" style={{ color: "var(--os-acento-1)" }}>
                      {cross.perfilEmpresa.taxa_conversao_estimada != null
                        ? `${(Number(cross.perfilEmpresa.taxa_conversao_estimada) * 100).toFixed(1)}%`
                        : "—"}
                    </div>
                  </div>
                  <div className="os-card p-3">
                    <div className="tiny uppercase text-txt3">Conversas destiladas</div>
                    <div className="text-lg font-semibold mt-1 tabular-nums">
                      {cross.perfilEmpresa.conversas_destiladas}
                    </div>
                  </div>
                </div>
                <div className="os-card p-4 muted small">
                  <div className="row gap-2 mb-2">
                    <Icon name="info" size={13} />
                    <span>
                      Versão {cross.perfilEmpresa.versao} · destilado em{" "}
                      {cross.perfilEmpresa.destilacao_ultima_em
                        ? new Date(cross.perfilEmpresa.destilacao_ultima_em).toLocaleString("pt-BR")
                        : "—"}
                    </span>
                  </div>
                  <div className="tiny">
                    <strong>V1</strong> destila só métricas quantitativas.{" "}
                    <strong>V2</strong> (próxima onda) chama LLM Mentor pra extrair top_objecoes,
                    argumentos_ganhadores/perdedores e perfil_lead_ideal a partir das conversas com desfecho.
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Comparativo nicho — REAL (Trilho B5) ── */}
        {tab === "comparativo" && (
          <div className="space-y-4">
            <div
              className="rounded-lg px-4 py-3 small row gap-2"
              style={{
                background: "oklch(0.55 0.14 250 / 0.08)",
                border: "1px solid oklch(0.55 0.14 250 / 0.20)",
                color: "oklch(0.75 0.08 250)",
              }}
            >
              <Icon name="info" size={14} style={{ flexShrink: 0 }} />
              <span>
                <strong>comparativo_nicho</strong> publica benchmarks por nicho com{" "}
                <span className="mono">k-anonimato N≥10</span> +{" "}
                <span className="mono">ε=0.1</span> ruído differential privacy.
                Cron de agregação roda quando nicho atinge 10+ tenants ativos.
              </span>
            </div>

            {cross.comparativos.length === 0 ? (
              <div className="os-card p-6 flex flex-col items-center gap-3 text-center muted">
                <Icon name="chart-bar" size={32} />
                <div className="small font-medium">Nenhum benchmark publicado ainda</div>
                <div className="tiny max-w-md">
                  Quando algum nicho tiver 10+ tenants ativos com leads destilados, o cron publica
                  métricas anonimizadas aqui (taxa conversão média, ticket médio, top objeções do nicho).
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {cross.comparativos.map((c) => (
                  <div key={c.id} className="os-card p-3">
                    <div className="row gap-2 mb-2">
                      <span className="mono small font-medium">{c.metrica}</span>
                      <span className="ml-auto badge badge-info tiny mono">N={c.count_tenants}</span>
                      <span className="badge tiny mono">ε={c.epsilon}</span>
                    </div>
                    <pre className="tiny mono muted whitespace-pre-wrap">
                      {JSON.stringify(c.valor_anonimizado, null, 2)}
                    </pre>
                    <div className="tiny muted mono mt-2">
                      janela {c.janela_dias}d · {new Date(c.calculado_em).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Candidatos ── */}
        {tab === "candidatos" && <TabCandidatos />}
      </div>
    </div>
  );
}
