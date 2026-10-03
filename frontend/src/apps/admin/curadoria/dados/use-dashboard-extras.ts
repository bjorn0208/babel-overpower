import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TopGaveta {
  gaveta: string;
  acionamentos: number;
}

export interface SerieConversaDia {
  dia: string;
  conversas: number;
}

export interface UseDashboardExtrasResultado {
  status: "carregando" | "ok" | "erro";
  topGavetas: TopGaveta[];
  serie30d: SerieConversaDia[];
  erro: string | null;
  refetch: () => Promise<void>;
}

export function useDashboardExtras(): UseDashboardExtrasResultado {
  const [status, setStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [topGavetas, setTopGavetas] = useState<TopGaveta[]>([]);
  const [serie30d, setSerie30d] = useState<SerieConversaDia[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const ativoRef = useRef(true);

  const carregar = useCallback(async () => {
    setStatus("carregando");
    setErro(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [topRes, serieRes] = await Promise.all([
      (supabase as any).from("vw_dashboard_top_gavetas").select("*"),
      (supabase as any).from("vw_dashboard_serie_30d").select("*"),
    ]);

    if (!ativoRef.current) return;

    if (topRes.error || serieRes.error) {
      const msg = topRes.error?.message ?? serieRes.error?.message ?? "erro";
      console.error("[useDashboardExtras] erro:", msg);
      setStatus("erro");
      setErro(msg);
      return;
    }

    setTopGavetas((topRes.data ?? []) as TopGaveta[]);
    setSerie30d((serieRes.data ?? []) as SerieConversaDia[]);
    setStatus("ok");
  }, []);

  useEffect(() => {
    ativoRef.current = true;
    carregar();
    return () => {
      ativoRef.current = false;
    };
  }, [carregar]);

  return { status, topGavetas, serie30d, erro, refetch: carregar };
}
