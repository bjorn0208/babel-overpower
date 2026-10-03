// @ts-nocheck
/**
 * funil-desfecho.tsx — componentes do funil de desfecho de leads.
 * Extraído de AbaCrossNicho.tsx (Onda 9).
 *
 * Exporta:
 *  - useFunilDesfecho  (hook de dados)
 *  - CardDesfecho      (card de contagem por estado)
 *  - FunilVisual       (SVG do funil)
 *  - TabCandidatos     (bandeja de candidatos cross-nicho)
 */

import { useEffect, useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { supabase } from "@/integrations/supabase/client";
import { useCandidatosBloco } from "../dados/use-candidatos-bloco";

// ─── tipos ────────────────────────────────────────────────────────────────────

export interface DesfechoCount {
  estado: string;
  label: string;
  count: number;
  pct: number;
  cor: string;
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useFunilDesfecho(tenantId: string | null) {
  const [funil, setFunil] = useState<DesfechoCount[]>([]);
  const [status, setStatus] = useState<"ocioso" | "carregando" | "ok" | "erro">("ocioso");

  useEffect(() => {
    if (!tenantId) {
      setFunil([]);
      setStatus("ocioso");
      return;
    }

    let montado = true;
    setStatus("carregando");

    supabase
      .from("leads")
      .select("desfecho")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .then(({ data, error }) => {
        if (!montado) return;
        if (error) { setStatus("erro"); return; }

        const contagem: Record<string, number> = {};
        for (const row of data ?? []) {
          const d = row.desfecho ?? "em_aberto";
          contagem[d] = (contagem[d] ?? 0) + 1;
        }

        const total = Object.values(contagem).reduce((a, b) => a + b, 0) || 1;
        const CONFIG: Record<string, { label: string; cor: string }> = {
          em_aberto:  { label: "Em aberto",  cor: "info" },
          convertido: { label: "Convertido", cor: "acento" },
          perdido:    { label: "Perdido",    cor: "perigo" },
          sumiu:      { label: "Sumiu",      cor: "neutro" },
        };

        const lista = Object.entries(contagem).map(([estado, count]) => ({
          estado,
          label: CONFIG[estado]?.label ?? estado,
          count,
          pct: Math.round((count / total) * 100),
          cor: CONFIG[estado]?.cor ?? "neutro",
        }));

        lista.sort((a, b) => b.count - a.count);
        setFunil(lista);
        setStatus("ok");
      });

    return () => { montado = false; };
  }, [tenantId]);

  return { funil, status };
}

// ─── sub-componentes ──────────────────────────────────────────────────────────

export const COR_MAP: Record<string, string> = {
  acento:  "var(--os-acento-1)",
  perigo:  "var(--os-perigo)",
  info:    "var(--os-info)",
  neutro:  "var(--os-txt3)",
};

export function CardDesfecho({ d }: { d: DesfechoCount }) {
  const cor = COR_MAP[d.cor] ?? "var(--os-txt3)";
  return (
    <div className="os-card p-3">
      <div className="tiny uppercase text-txt3 tracking-wide">{d.label}</div>
      <div
        className="text-2xl font-semibold tabular-nums mt-1"
        style={{ color: cor }}
      >
        {d.count}
      </div>
      <div className="tiny mono muted mt-0.5">
        {d.pct}% do total · <span className="mono">leads.desfecho = '{d.estado}'</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--os-borda)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${d.pct}%`, background: cor }}
        />
      </div>
    </div>
  );
}

export function FunilVisual({ funil }: { funil: DesfechoCount[] }) {
  if (funil.length === 0) return null;
  const total = funil.reduce((a, b) => a + b.count, 0) || 1;
  return (
    <svg width="100%" viewBox="0 0 900 160" preserveAspectRatio="xMidYMid meet">
      {funil.map((d, i) => {
        const x = i * 220 + 20;
        const w = (d.count / total) * 600 + 80;
        const cor = COR_MAP[d.cor] ?? "oklch(0.55 0.01 240)";
        return (
          <g key={d.estado}>
            <rect
              x={x}
              y={80 - w / 8}
              width={200}
              height={w / 4}
              rx={6}
              fill={cor}
              opacity={0.18}
              stroke={cor}
              strokeWidth={1.5}
            />
            <text
              x={x + 100}
              y={80 - w / 8 - 8}
              textAnchor="middle"
              fontSize={10}
              fill="oklch(0.75 0.01 240)"
              fontFamily="JetBrains Mono, monospace"
            >
              {d.label.toUpperCase()}
            </text>
            <text
              x={x + 100}
              y={86}
              textAnchor="middle"
              fontSize={20}
              fill="oklch(0.96 0.005 240)"
              fontWeight={600}
              fontFamily="Inter, sans-serif"
            >
              {d.count}
            </text>
            <text
              x={x + 100}
              y={104}
              textAnchor="middle"
              fontSize={10}
              fill="oklch(0.55 0.01 240)"
              fontFamily="JetBrains Mono, monospace"
            >
              {d.pct}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function TabCandidatos() {
  const { candidatos, status, decidir } = useCandidatosBloco();
  const pendentes = candidatos.filter((c) => c.status === "pendente");

  if (status === "carregando") {
    return <div className="muted small">Carregando candidatos…</div>;
  }

  if (status === "erro") {
    return (
      <div className="small" style={{ color: "var(--os-perigo)" }}>
        Erro ao carregar candidatos.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendentes.length > 0 && (
        <div
          className="rounded-lg px-3 py-2 small row gap-2"
          style={{
            background: "oklch(0.70 0.16 85 / 0.10)",
            border: "1px solid oklch(0.70 0.16 85 / 0.30)",
            color: "oklch(0.85 0.10 85)",
          }}
        >
          <Icon name="warning" size={13} style={{ flexShrink: 0 }} />
          <span>
            <strong>{pendentes.length} candidatos pendentes</strong>. Gerados pelo cron{" "}
            <span className="mono">cron-gerar-candidatos</span>.
          </span>
        </div>
      )}

      {candidatos.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 gap-2 muted">
          <Icon name="inbox" size={24} />
          <span className="small">Bandeja vazia — todos os candidatos foram decididos.</span>
          <span className="tiny">Próximo lote roda 2ª-feira 04h.</span>
        </div>
      )}

      {candidatos.map((c) => (
        <div
          key={c.id}
          className="os-card p-4"
          style={c.status !== "pendente" ? { opacity: 0.6 } : undefined}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="tiny mono muted">{c.id.slice(0, 8)}…</span>
                {c.tabela_origem && (
                  <span
                    className="badge tiny mono"
                    style={{
                      background: "oklch(0.55 0.14 300 / 0.12)",
                      color: "oklch(0.65 0.18 300)",
                      border: "1px solid oklch(0.55 0.14 300 / 0.25)",
                    }}
                  >
                    {c.tabela_origem}
                  </span>
                )}
                {c.escopo_alvo && (
                  <span className="badge badge-neutral tiny mono">{c.escopo_alvo}</span>
                )}
                {c.n_tenants_aprovaram != null && (
                  <span
                    className="badge tiny mono"
                    style={{
                      background: "var(--os-acento-1-soft)",
                      color: "var(--os-acento-1)",
                      border: "1px solid var(--os-acento-1)",
                    }}
                  >
                    {c.n_tenants_aprovaram} tenants convergem
                  </span>
                )}
                {c.status !== "pendente" && (
                  <span
                    className="badge tiny mono"
                    style={{
                      background:
                        c.status === "aprovado"
                          ? "oklch(0.72 0.18 145 / 0.12)"
                          : "oklch(0.65 0.20 25 / 0.12)",
                      color:
                        c.status === "aprovado"
                          ? "oklch(0.72 0.18 145)"
                          : "oklch(0.65 0.20 25)",
                    }}
                  >
                    {c.status}
                  </span>
                )}
                <span className="ml-auto tiny mono muted">
                  {c.criado_em ? new Date(c.criado_em).toLocaleDateString("pt-BR") : ""}
                </span>
              </div>
              <div className="small text-txt leading-relaxed">{c.conteudo_proposto}</div>
              {c.bloco_origem_id && (
                <div className="tiny mono muted mt-1.5">
                  origem: bloco {c.bloco_origem_id.slice(0, 8)}…
                </div>
              )}
            </div>

            {c.status === "pendente" && (
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => decidir(c.id, "aprovado")}
                >
                  <Icon name="check" size={13} />
                  aprovar
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: "var(--os-perigo)", color: "#fff", border: "none" }}
                  onClick={() => decidir(c.id, "recusado")}
                >
                  <Icon name="x" size={13} />
                  recusar
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
