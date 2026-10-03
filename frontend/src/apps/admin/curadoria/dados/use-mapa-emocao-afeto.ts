import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EmocaoMapaReal {
  emocao: string;
  valencia: number;
  ativacao: number;
}

export interface CelulaHumor {
  dia_semana: number;
  hora: number;
  qtd: number;
  valencia_media: number;
}

export interface UseMapaEmocaoAfetoResultado {
  status: "carregando" | "ok" | "erro";
  emocoes: EmocaoMapaReal[];
  heatmap: CelulaHumor[];
  erro: string | null;
  salvar: (emocao: string, patch: Partial<EmocaoMapaReal>) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useMapaEmocaoAfeto(): UseMapaEmocaoAfetoResultado {
  const [status, setStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [emocoes, setEmocoes] = useState<EmocaoMapaReal[]>([]);
  const [heatmap, setHeatmap] = useState<CelulaHumor[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const ativoRef = useRef(true);

  const carregar = useCallback(async () => {
    setStatus("carregando");
    setErro(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [mapRes, heatRes] = await Promise.all([
      (supabase as any).from("mapa_emocao_afeto").select("*").order("emocao"),
      (supabase as any).from("vw_heatmap_humor_7d").select("*"),
    ]);

    if (!ativoRef.current) return;

    if (mapRes.error) {
      console.error("[useMapaEmocaoAfeto] erro mapa:", mapRes.error.message);
      setStatus("erro");
      setErro(mapRes.error.message);
      return;
    }

    setEmocoes((mapRes.data ?? []) as EmocaoMapaReal[]);
    setHeatmap((heatRes.data ?? []) as CelulaHumor[]);
    setStatus("ok");
  }, []);

  useEffect(() => {
    ativoRef.current = true;
    carregar();
    return () => {
      ativoRef.current = false;
    };
  }, [carregar]);

  const salvar = useCallback(
    async (emocao: string, patch: Partial<EmocaoMapaReal>) => {
      // otimista
      setEmocoes((atual) =>
        atual.map((e) => (e.emocao === emocao ? { ...e, ...patch } : e)),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("mapa_emocao_afeto")
        .update({
          valencia: patch.valencia,
          ativacao: patch.ativacao,
        })
        .eq("emocao", emocao);

      if (error) {
        console.error("[useMapaEmocaoAfeto] erro salvar:", error.message);
        carregar();
        throw new Error(error.message);
      }
    },
    [carregar],
  );

  return { status, emocoes, heatmap, erro, salvar, refetch: carregar };
}
