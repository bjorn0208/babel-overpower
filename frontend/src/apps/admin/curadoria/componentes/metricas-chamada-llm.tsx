// @ts-nocheck
/**
 * MetricasChamadaLlm — sub-aba métricas do PainelEdicaoChamada.
 * Extraído de painel-edicao-chamada.tsx (Onda 5).
 * Agrega traces das últimas 24h e exibe KPIs reais + nota sobre modelo_override.
 */

import { Icon } from "@/bundle/bundle-shared";
import { useMetricasChamada } from "../dados/use-metricas-chamada";
import { MetricaCard } from "./metrica-card";

interface MetricasChamadaLlmProps {
  chave: string;
  modeloConfig: string;
  versao: number;
}

export function MetricasChamadaLlm({ chave, modeloConfig, versao }: MetricasChamadaLlmProps) {
  const { metricas, status } = useMetricasChamada(chave);

  return (
    <div className="space-y-4">
      {status === "carregando" && (
        <div className="tiny muted" style={{ opacity: 0.7 }}>
          carregando métricas…
        </div>
      )}

      {status === "pronto" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricaCard
              label="Latência P50 (24h)"
              valor={metricas?.latencia_p50_ms ?? "—"}
              unidade={metricas?.latencia_p50_ms != null ? "ms" : undefined}
            />
            <MetricaCard
              label="Latência P95 (24h)"
              valor={metricas?.latencia_p95_ms ?? "—"}
              unidade={metricas?.latencia_p95_ms != null ? "ms" : undefined}
              cor={
                metricas?.latencia_p95_ms && metricas.latencia_p95_ms > 5000
                  ? "var(--os-perigo)"
                  : undefined
              }
            />
            <MetricaCard
              label="Tokens in médios/chamada"
              valor={metricas?.custo_medio_tokens_in ?? "—"}
              unidade={metricas?.custo_medio_tokens_in != null ? "tok" : undefined}
            />
            <MetricaCard
              label="Tokens out médios/chamada"
              valor={metricas?.custo_medio_tokens_out ?? "—"}
              unidade={metricas?.custo_medio_tokens_out != null ? "tok" : undefined}
              cor="var(--os-acento-1)"
            />
          </div>

          {/* Total de chamadas + modelo mais usado vs config */}
          <div className="os-card px-4 py-3 space-y-1">
            <div className="tiny uppercase text-txt3">Total chamadas 24h</div>
            <div className="small font-semibold tabular-nums">
              {metricas?.total_chamadas_24h ?? 0}
            </div>
            {metricas?.modelo_mais_usado && (
              <>
                <div className="tiny uppercase text-txt3 mt-2">Modelo mais usado em prod (24h)</div>
                <div className="row gap-2 flex-wrap">
                  <span className="small mono">{metricas.modelo_mais_usado}</span>
                  {metricas.modelo_mais_usado !== modeloConfig && (
                    <span
                      className="badge tiny"
                      style={{
                        background: "oklch(0.70 0.16 85 / 0.15)",
                        color: "oklch(0.85 0.10 85)",
                        border: "1px solid oklch(0.70 0.16 85 / 0.35)",
                      }}
                    >
                      diverge da config
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Fix 5.4 — nota sobre modelo_override do Chat de Teste */}
          <div
            className="rounded-lg px-4 py-3 small"
            style={{
              background: "oklch(0.55 0.14 250 / 0.08)",
              border: "1px solid oklch(0.55 0.14 250 / 0.20)",
              color: "oklch(0.75 0.08 250)",
            }}
          >
            <Icon name="info" size={13} className="inline mr-1.5" />
            O Chat de Teste do Curadoria envia{" "}
            <span className="mono">modelo_override</span> pra testar modelos diferentes sem
            mudar a config viva. As chamadas reais do motor em produção usam{" "}
            <strong>sempre</strong> a config desta tabela.
          </div>
        </>
      )}

      <MetricaCard label="Versão atual" valor={`v${versao}`} />
    </div>
  );
}
