import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface KpisCuradoria {
  custo_total_usd: number;
  chamadas_total: number;
  conversas_24h: number;
  conversas_7d: number;
  conversas_30d: number;
  leads_ativos: number;
  leads_convertidos: number;
  leads_sumidos: number;
  leads_recusados: number;
  leads_total: number;
  taxa_conversao_global: number;
  msgs_humano: number;
  msgs_agente: number;
  msgs_por_humano: number;
  calculado_em: string;
}

export interface UseDashboardCuradoriaResultado {
  status: "carregando" | "ok" | "erro";
  kpis: KpisCuradoria | null;
  erro: string | null;
  refetch: () => Promise<void>;
}

export function useDashboardCuradoria(): UseDashboardCuradoriaResultado {
  const [status, setStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [kpis, setKpis] = useState<KpisCuradoria | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ativoRef = useRef(true);

  const carregar = useCallback(async () => {
    setStatus("carregando");
    setErro(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vw_dashboard_curadoria")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!ativoRef.current) return;

    if (error) {
      console.error("[useDashboardCuradoria] erro:", error.message);
      setStatus("erro");
      setErro(error.message);
      return;
    }

    setKpis((data ?? null) as KpisCuradoria | null);
    setStatus("ok");
  }, []);

  useEffect(() => {
    ativoRef.current = true;
    carregar();
    return () => {
      ativoRef.current = false;
    };
  }, [carregar]);

  return { status, kpis, erro, refetch: carregar };
}
