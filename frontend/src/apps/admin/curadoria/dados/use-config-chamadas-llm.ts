import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type EscopoConfig = "global" | "nicho" | "tenant";
export type PosicaoConfig = "turno" | "cron";

export interface ConfigChamadaLlm {
  chave: string;
  nome: string;
  descricao: string | null;
  modelo: string;
  temperatura: number;
  max_tokens: number;
  prompt_template: string;
  itens_produzidos: string[];
  escopo: EscopoConfig;
  nicho_id: string | null;
  tenant_id: string | null;
  custo_teto_diario: number | null;
  notas: string | null;
  posicao: PosicaoConfig;
  schedule: string | null;
  json_mode: boolean;
  versao: number;
  ativo: boolean;
  deleted_at: string | null;
  atualizado_em: string;
}

export interface HistoricoConfig {
  id: string;
  chave: string;
  versao: number;
  modelo: string;
  temperatura: number;
  max_tokens: number;
  prompt_template: string;
  itens_produzidos: string[];
  escopo: string | null;
  nicho_id: string | null;
  tenant_id: string | null;
  custo_teto_diario: number | null;
  notas: string | null;
  posicao: string | null;
  schedule: string | null;
  json_mode: boolean | null;
  alterado_em: string;
  motivo: string | null;
}

export interface UseConfigChamadasLlmResultado {
  status: "carregando" | "ok" | "erro";
  chamadas: ConfigChamadaLlm[];
  erro: string | null;
  refetch: () => Promise<void>;
  salvar: (chave: string, patch: Partial<ConfigChamadaLlm>) => Promise<void>;
  historico: (chave: string) => Promise<HistoricoConfig[]>;
}

export function useConfigChamadasLlm(): UseConfigChamadasLlmResultado {
  const [status, setStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [chamadas, setChamadas] = useState<ConfigChamadaLlm[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const ativoRef = useRef(true);

  const carregar = useCallback(async () => {
    setStatus("carregando");
    setErro(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("config_chamadas_llm")
      .select("*")
      .is("deleted_at", null)
      .order("chave");

    if (!ativoRef.current) return;

    if (error) {
      console.error("[useConfigChamadasLlm] erro carregar:", error.message);
      setStatus("erro");
      setErro(error.message);
      return;
    }

    setChamadas((data ?? []) as ConfigChamadaLlm[]);
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
    async (chave: string, patch: Partial<ConfigChamadaLlm>) => {
      // Otimista
      setChamadas((atual) =>
        atual.map((c) => (c.chave === chave ? { ...c, ...patch } : c)),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("config_chamadas_llm")
        .update({
          nome: patch.nome,
          descricao: patch.descricao,
          modelo: patch.modelo,
          temperatura: patch.temperatura,
          max_tokens: patch.max_tokens,
          prompt_template: patch.prompt_template,
          itens_produzidos: patch.itens_produzidos,
          escopo: patch.escopo,
          nicho_id: patch.nicho_id,
          tenant_id: patch.tenant_id,
          custo_teto_diario: patch.custo_teto_diario,
          notas: patch.notas,
          posicao: patch.posicao,
          schedule: patch.schedule,
          json_mode: patch.json_mode,
          ativo: patch.ativo,
        })
        .eq("chave", chave);

      if (error) {
        console.error("[useConfigChamadasLlm] erro salvar:", error.message);
        // rollback
        carregar();
        throw new Error(error.message);
      }

      // recarrega pra pegar nova versão do trigger snapshot
      carregar();
    },
    [carregar],
  );

  const historico = useCallback(
    async (chave: string): Promise<HistoricoConfig[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("historico_config_chamadas_llm")
        .select("*")
        .eq("chave", chave)
        .order("versao", { ascending: false })
        .limit(20);

      if (error) {
        console.error("[useConfigChamadasLlm] erro historico:", error.message);
        return [];
      }

      return (data ?? []) as HistoricoConfig[];
    },
    [],
  );

  return { status, chamadas, erro, refetch: carregar, salvar, historico };
}
