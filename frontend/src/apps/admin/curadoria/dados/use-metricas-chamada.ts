import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MetricasChamada = {
  modelo_mais_usado: string | null;
  latencia_p50_ms: number | null;
  latencia_p95_ms: number | null;
  custo_medio_tokens_in: number | null;
  custo_medio_tokens_out: number | null;
  total_chamadas_24h: number;
};

// Mapeia chave da config_chamadas_llm → tipo gravado em traces
const TIPO_TRACE: Record<string, string> = {
  porteiro: "porteiro",
  sintese: "sintese",
  extrator: "ferramenta",
  mentor: "ferramenta",
  auditor_groundedness: "ferramenta",
  canal_mentor: "ferramenta",
  canal_curadoria: "ferramenta",
};

export function useMetricasChamada(chave: string) {
  const [metricas, setMetricas] = useState<MetricasChamada | null>(null);
  const [status, setStatus] = useState<"carregando" | "pronto" | "erro">("carregando");

  useEffect(() => {
    let ativo = true;

    (async () => {
      const tipo = TIPO_TRACE[chave];

      if (!tipo) {
        setMetricas({
          modelo_mais_usado: null,
          latencia_p50_ms: null,
          latencia_p95_ms: null,
          custo_medio_tokens_in: null,
          custo_medio_tokens_out: null,
          total_chamadas_24h: 0,
        });
        setStatus("pronto");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("traces")
        .select("modelo_llm, latencia_ms, custo_tokens_in, custo_tokens_out")
        .eq("tipo", tipo)
        .gte("criado_em", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(2000);

      if (!ativo) return;

      if (error || !data || data.length === 0) {
        setMetricas({
          modelo_mais_usado: null,
          latencia_p50_ms: null,
          latencia_p95_ms: null,
          custo_medio_tokens_in: null,
          custo_medio_tokens_out: null,
          total_chamadas_24h: 0,
        });
        setStatus("pronto");
        return;
      }

      // Agrega: frequência de modelos, latências, custos
      const modeloCount = new Map<string, number>();
      const latencias: number[] = [];
      let totalIn = 0;
      let totalOut = 0;
      let n = 0;

      for (const t of data as Array<{
        modelo_llm: string | null;
        latencia_ms: number | null;
        custo_tokens_in: number | null;
        custo_tokens_out: number | null;
      }>) {
        if (t.modelo_llm) {
          modeloCount.set(t.modelo_llm, (modeloCount.get(t.modelo_llm) ?? 0) + 1);
        }
        if (t.latencia_ms != null) latencias.push(t.latencia_ms);
        if (t.custo_tokens_in != null) {
          totalIn += t.custo_tokens_in;
          n++;
        }
        if (t.custo_tokens_out != null) totalOut += t.custo_tokens_out;
      }

      latencias.sort((a, b) => a - b);
      const p50 = latencias.length > 0 ? latencias[Math.floor(latencias.length * 0.5)] : null;
      const p95 = latencias.length > 0 ? latencias[Math.floor(latencias.length * 0.95)] : null;
      const modeloMaisUsado =
        modeloCount.size > 0
          ? [...modeloCount.entries()].sort((a, b) => b[1] - a[1])[0][0]
          : null;

      setMetricas({
        modelo_mais_usado: modeloMaisUsado,
        latencia_p50_ms: p50 ?? null,
        latencia_p95_ms: p95 ?? null,
        custo_medio_tokens_in: n > 0 ? Math.round(totalIn / n) : null,
        custo_medio_tokens_out: n > 0 ? Math.round(totalOut / n) : null,
        total_chamadas_24h: data.length,
      });
      setStatus("pronto");
    })();

    return () => {
      ativo = false;
    };
  }, [chave]);

  return { metricas, status };
}
