import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { JobCron } from "./tipos";

interface Estado {
  status: "carregando" | "ok" | "erro";
  jobs: JobCron[];
  erro: string | null;
}

interface JobCronRpc {
  chave: string;
  schedule: string;
  categoria: string;
  ativo: boolean;
  edge_function: string;
  ultima_exec: string | null;
  status_ultima: string | null;
  falhas_7d: number;
  sucessos_7d: number;
  duracao_media_ms: number;
}

export function useJobsCron(): Estado & {
  refetch: () => void;
  toggleAtivo: (chave: string, ativo: boolean) => Promise<void>;
} {
  const [estado, setEstado] = useState<Estado>({ status: "carregando", jobs: [], erro: null });
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let ativo = true;
    setEstado((e) => ({ ...e, status: "carregando" }));

    async function carregar() {
      try {
        // RPC retorna UNION agendamentos_config + cron.job com métricas reais (7d)
        const { data, error } = await (supabase as any).rpc("listar_jobs_com_historico");

        if (!ativo) return;

        if (error) {
          console.warn("[useJobsCron] erro RPC:", error.message);
          setEstado({ status: "erro", jobs: [], erro: error.message });
          return;
        }

        const jobs: JobCron[] = (data ?? []).map((r: JobCronRpc) => ({
          chave: r.chave,
          schedule: r.schedule ?? "—",
          categoria: (r.categoria as JobCron["categoria"]) ?? "operacional",
          ativo: r.ativo ?? true,
          edge_function: r.edge_function ?? "—",
          ultima_exec: r.ultima_exec ?? null,
          status_ultima: (r.status_ultima as JobCron["status_ultima"]) ?? null,
          falhas_30d: r.falhas_7d ?? 0,
          duracao_media_ms: r.duracao_media_ms ?? 0,
        }));

        setEstado({ status: "ok", jobs, erro: null });
      } catch (err: unknown) {
        if (!ativo) return;
        const msg = err instanceof Error ? err.message : "erro desconhecido";
        console.warn("[useJobsCron] exceção:", msg);
        setEstado({ status: "erro", jobs: [], erro: msg });
      }
    }

    carregar();
    return () => { ativo = false; };
  }, [rev]);

  const toggleAtivo = async (chave: string, novoAtivo: boolean) => {
    // atualização otimista
    setEstado((e) => ({
      ...e,
      jobs: e.jobs.map((j) => (j.chave === chave ? { ...j, ativo: novoAtivo } : j)),
    }));

    // RPC togglar_job faz cron.schedule/unschedule real + atualiza flag em agendamentos_config
    const { error } = await (supabase as any).rpc("togglar_job", {
      p_nome: chave,
      p_ativo: novoAtivo,
    });

    if (error) {
      console.warn("[useJobsCron] erro toggle:", error.message);
      // rollback otimista
      setRev((r) => r + 1);
    }
  };

  return { ...estado, refetch: () => setRev((r) => r + 1), toggleAtivo };
}
