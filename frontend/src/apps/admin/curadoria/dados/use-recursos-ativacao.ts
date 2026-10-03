import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RecursoAtivacao {
  id: string;
  chave_recurso: string;
  nome_comercial: string;
  descricao_curta: string;
  descricao_longa: string | null;
  categoria: "motor" | "sono" | "aprendizado" | "cross_nicho" | "qualidade" | "fosso";
  tipo: "cron" | "feature_motor" | "feature_ui" | "funcao_sql";
  cron_nome: string | null;
  edge_function: string | null;
  custo_estimado_mes_brl: number;
  dependencias_chaves: string[];
  status: "ativo" | "pausado" | "bloqueado";
  motivo_bloqueio: string | null;
  ativo: boolean;
  ordem: number;
  atualizado_em: string;
}

export interface UseRecursosResultado {
  status: "carregando" | "ok" | "erro";
  recursos: RecursoAtivacao[];
  erro: string | null;
  refetch: () => Promise<void>;
  ativar: (chave: string) => Promise<{ ok: boolean; erro?: string; aviso?: string }>;
  pausar: (chave: string) => Promise<{ ok: boolean; erro?: string }>;
}

export function useRecursosAtivacao(): UseRecursosResultado {
  const [status, setStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [recursos, setRecursos] = useState<RecursoAtivacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const ativoRef = useRef(true);

  const carregar = useCallback(async () => {
    setStatus("carregando");
    setErro(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("recursos_ativacao_curadoria")
      .select("*")
      .order("ordem", { ascending: true });
    if (!ativoRef.current) return;
    if (error) {
      console.error("[useRecursosAtivacao] erro:", error.message);
      setStatus("erro");
      setErro(error.message);
      return;
    }
    setRecursos((data ?? []) as RecursoAtivacao[]);
    setStatus("ok");
  }, []);

  useEffect(() => {
    ativoRef.current = true;
    carregar();
    return () => { ativoRef.current = false; };
  }, [carregar]);

  const ativar = useCallback(
    async (chave: string): Promise<{ ok: boolean; erro?: string; aviso?: string }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("ativar_recurso_curadoria", { p_chave: chave });
      if (error) return { ok: false, erro: error.message };
      await carregar();
      return data as { ok: boolean; erro?: string; aviso?: string };
    },
    [carregar],
  );

  const pausar = useCallback(
    async (chave: string): Promise<{ ok: boolean; erro?: string }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("pausar_recurso_curadoria", { p_chave: chave });
      if (error) return { ok: false, erro: error.message };
      await carregar();
      return data as { ok: boolean; erro?: string };
    },
    [carregar],
  );

  return { status, recursos, erro, refetch: carregar, ativar, pausar };
}
