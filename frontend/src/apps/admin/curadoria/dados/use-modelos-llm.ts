import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ModeloLlm = {
  slug: string;
  nome: string;
  custo_input_1m: number;
  custo_output_1m: number;
  context_window: number | null;
  is_default: boolean;
};

export function useModelosLlm() {
  const [modelos, setModelos] = useState<ModeloLlm[]>([]);
  const [status, setStatus] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("modelos_llm")
        .select("slug, nome, custo_input_1m, custo_output_1m, context_window, is_default")
        .eq("is_active", true)
        .order("slug");

      if (!ativo) return;

      if (error) {
        setErro(error.message);
        setStatus("erro");
        return;
      }

      setModelos(data ?? []);
      setStatus("pronto");
    })();

    return () => {
      ativo = false;
    };
  }, []);

  return { modelos, status, erro };
}
