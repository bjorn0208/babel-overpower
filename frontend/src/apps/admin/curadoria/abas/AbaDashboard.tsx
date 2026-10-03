// @ts-nocheck
/**
 * AbaDashboard — visão executiva KPIs reais + Top tenants + Saúde do motor.
 * KPIs: view vw_dashboard_curadoria (Onda D — banco real).
 * Top tenants: banco real via useTenantsImpersonaveis.
 */

import { useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { useTenantsImpersonaveis } from "../dados/use-tenants-impersonaveis";
import { useDashboardCuradoria } from "../dados/use-dashboard-curadoria";
import { useDashboardExtras } from "../dados/use-dashboard-extras";

// dados reais via vw_dashboard_top_gavetas e vw_dashboard_serie_30d (Onda 4)

// ─── sub-componentes ─────────────────────────────────────────────────────────

function KpiCard({
  titulo,
  valor,
  delta,
  positivo,
  sub,
}: {
  titulo: string;
  valor: string;
  delta?: string;
  positivo?: boolean;
  sub?: string;
}) {
  return (
    <div className="os-card" style={{ padding: 12 }}>
      <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{titulo}</div>
      <div className="row gap-2" style={{ alignItems: "baseline", marginTop: 4 }}>
        <span className="kpi-num" style={{ fontSize: 22 }}>{valor}</span>
        {delta && (
          <span className="mono" style={{ fontSize: 11, color: positivo ? "oklch(0.72 0.18 145)" : "oklch(0.65 0.20 25)" }}>
            {delta}
          </span>
        )}
      </div>
      {sub && <div className="muted tiny" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function GraficoBarras({ dados }: { dados: number[] }) {
  const max = Math.max(...dados);
  const w = 760, h = 120;
  const bw = w / dados.length;
  // média móvel 7d
  const media = dados.map((_, i) => {
    const slice = dados.slice(Math.max(0, i - 3), Math.min(dados.length, i + 4));
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const linhaMedia = media.map((v, i) => `${i === 0 ? "M" : "L"} ${i * bw + bw / 2} ${h - (v / max) * h}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 16}`} preserveAspectRatio="none">
      {dados.map((v, i) => (
        <rect key={i} x={i * bw + 1} y={h - (v / max) * h} width={bw - 2} height={(v / max) * h} fill="oklch(0.32 0.01 240)" />
      ))}
      <path d={linhaMedia} stroke="oklch(0.72 0.18 145)" strokeWidth="1.8" fill="none" />
      {[0, 7, 14, 21, 29].map((i) => (
        <text key={i} x={i * bw + bw / 2} y={h + 12} textAnchor="middle" fontSize="9" fill="oklch(0.55 0.01 240)" fontFamily="monospace">
          d-{29 - i}
        </text>
      ))}
    </svg>
  );
}

function BarrasHorizontais({ dados }: { dados: { label: string; valor: number }[] }) {
  const max = Math.max(...dados.map((d) => d.valor));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {dados.map(({ label, valor }) => (
        <div key={label} className="row gap-3" style={{ alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 11, width: 220, flexShrink: 0, color: "var(--txt-3)" }}>{label}</span>
          <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(valor / max) * 100}%`, background: "oklch(0.72 0.18 145)", borderRadius: 99 }} />
          </div>
          <span className="mono" style={{ fontSize: 11, width: 60, textAlign: "right" }}>{valor.toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
}

// ─── componente principal ────────────────────────────────────────────────────

export function AbaDashboard() {
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "90d">("30d");
  const { status, tenants } = useTenantsImpersonaveis();
  const dashboard = useDashboardCuradoria();
  const extras = useDashboardExtras();
  const kpis = dashboard.kpis;
  const serie30d = extras.serie30d.map((s) => s.conversas);
  const topGavetas = extras.topGavetas;

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Cabeçalho */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="h1" style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.2 }}>Dashboard</div>
          {dashboard.status === "carregando" && (
            <div className="muted small" style={{ marginTop: 4, opacity: 0.6 }}>carregando KPIs…</div>
          )}
          {dashboard.status === "erro" && (
            <div className="small" style={{ marginTop: 4, color: "oklch(0.82 0.20 25)" }}>
              erro ao carregar: {dashboard.erro}
            </div>
          )}
        </div>
        <div className="row" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, overflow: "hidden" }}>
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button key={p} onClick={() => setPeriodo(p)} className="btn btn-ghost btn-sm"
              style={{ borderRadius: 0, background: periodo === p ? "rgba(255,255,255,0.08)" : "transparent", fontFamily: "monospace", fontSize: 11 }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs linha 1 — REAL */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <KpiCard titulo="Conversas / 24h" valor={(kpis?.conversas_24h ?? 0).toLocaleString("pt-BR")} sub={kpis ? `${kpis.conversas_7d} em 7d` : undefined} />
        <KpiCard titulo="Conversas / 30d" valor={(kpis?.conversas_30d ?? 0).toLocaleString("pt-BR")} />
        <KpiCard titulo="Custo LLM 30d" valor={kpis ? `$${Number(kpis.custo_total_usd).toFixed(2)}` : "—"} sub={kpis ? `${kpis.chamadas_total.toLocaleString("pt-BR")} chamadas` : undefined} />
        <KpiCard titulo="Mensagens 30d" valor={kpis ? `${((kpis.msgs_humano + kpis.msgs_agente) / 1000).toFixed(1)}k` : "—"} sub={kpis ? `${kpis.msgs_por_humano} por humano` : undefined} />
      </div>

      {/* KPIs linha 2 — REAL */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <KpiCard titulo="Leads ativos" valor={(kpis?.leads_ativos ?? 0).toLocaleString("pt-BR")} sub={kpis ? `${kpis.leads_total} total` : undefined} />
        <KpiCard titulo="Convertidos" valor={(kpis?.leads_convertidos ?? 0).toLocaleString("pt-BR")} />
        <KpiCard titulo="Sumidos" valor={(kpis?.leads_sumidos ?? 0).toLocaleString("pt-BR")} sub="marcados via cron-leads-sumidos" />
        <KpiCard titulo="Taxa conversão" valor={kpis ? `${(Number(kpis.taxa_conversao_global) * 100).toFixed(1)}%` : "—"} sub="convertidos / (conv+sum+rec)" />
      </div>

      {/* Gráfico + Top Tenants */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div className="os-card" style={{ padding: 16 }}>
          <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Conversas / dia · 30d</div>
          <div className="muted tiny" style={{ marginBottom: 12 }}>média móvel 7d em destaque · banco real</div>
          {extras.status === "carregando" ? (
            <div style={{ height: 136, background: "rgba(255,255,255,0.03)", borderRadius: 6, animation: "pulse 1.5s ease-in-out infinite" }} />
          ) : serie30d.length > 0 && Math.max(...serie30d) > 0 ? (
            <GraficoBarras dados={serie30d} />
          ) : (
            <div className="muted small" style={{ padding: "32px 0", textAlign: "center" }}>sem conversas nos últimos 30d</div>
          )}
        </div>

        <div className="os-card" style={{ padding: 16 }}>
          <div className="muted tiny" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Top tenants · {periodo} · banco real</div>
          {status === "carregando" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ height: 36, background: "rgba(255,255,255,0.03)", borderRadius: 6, animation: "pulse 1.5s ease-in-out infinite" }} />
              ))}
            </div>
          )}
          {status === "ok" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tenants.slice(0, 7).map((t) => (
                <div key={t.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                  <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.nome}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--txt-3)", flexShrink: 0, marginLeft: 8 }}>
                    {t.leads} leads
                  </div>
                </div>
              ))}
              {tenants.length === 0 && <div className="muted small">Nenhum tenant cadastrado.</div>}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
