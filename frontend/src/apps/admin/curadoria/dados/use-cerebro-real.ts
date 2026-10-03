import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CerebroKpis {
  turnos_hora: number;
  latencia_p50_ms: number;
  latencia_p95_ms: number;
  custo_hora_usd: number;
  calculado_em: string;
}

export interface CerebroTurno {
  id: string;
  criado_em: string;
  lead_id: string | null;
  lead_nome: string | null;
  tenant_id: string | null;
  modelo_llm: string | null;
  tipo: string | null;
  latencia_ms: number | null;
  custo_tokens_in: number | null;
  custo_tokens_out: number | null;
  confianca: number | null;
  cargo_nome: string | null;
  custo_usd_estimado: number | null;
}

export interface UseCerebroRealResultado {
  status: "carregando" | "ok" | "erro";
  kpis: CerebroKpis | null;
  turnos: CerebroTurno[];
  erro: string | null;
  refetch: () => Promise<void>;
}

export function useCerebroReal(): UseCerebroRealResultado {
  const [status, setStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [kpis, setKpis] = useState<CerebroKpis | null>(null);
  const [turnos, setTurnos] = useState<CerebroTurno[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const ativoRef = useRef(true);

  const carregar = useCallback(async () => {
    setStatus("carregando");
    setErro(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [kpisRes, turnosRes] = await Promise.all([
      (supabase as any).from("vw_cerebro_kpis_1h").select("*").limit(1).maybeSingle(),
      (supabase as any).from("vw_cerebro_turnos_recentes").select("*").limit(50),
    ]);

    if (!ativoRef.current) return;

    if (kpisRes.error || turnosRes.error) {
      const msg = kpisRes.error?.message ?? turnosRes.error?.message ?? "erro";
      console.error("[useCerebroReal] erro:", msg);
      setStatus("erro");
      setErro(msg);
      return;
    }

    setKpis((kpisRes.data ?? null) as CerebroKpis | null);
    setTurnos((turnosRes.data ?? []) as CerebroTurno[]);
    setStatus("ok");
  }, []);

  useEffect(() => {
    ativoRef.current = true;
    carregar();
    return () => {
      ativoRef.current = false;
    };
  }, [carregar]);

  return { status, kpis, turnos, erro, refetch: carregar };
}
