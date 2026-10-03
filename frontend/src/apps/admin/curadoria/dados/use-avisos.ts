import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AvisoCuradoria } from "./tipos";

export interface UseAvisosResultado {
  status: "carregando" | "ok" | "erro";
  avisos: AvisoCuradoria[];
  erro: string | null;
  refetch: () => Promise<void>;
  marcarLido: (id: string) => Promise<void>;
  arquivar: (id: string) => Promise<void>;
}

export function useAvisos(opts?: { realtime?: boolean }): UseAvisosResultado {
  const realtime = opts?.realtime ?? true;

  const [status, setStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [avisos, setAvisos] = useState<AvisoCuradoria[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  // ref para evitar setState após unmount
  const ativoRef = useRef(true);

  const carregar = useCallback(async () => {
    setStatus("carregando");
    setErro(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("avisos_curadoria")
      .select("*")
      .is("deleted_at", null)
      .is("arquivado_em", null)
      .order("criado_em", { ascending: false })
      .limit(50);

    if (!ativoRef.current) return;

    if (error) {
      console.error("[useAvisos] erro ao carregar avisos:", error.message);
      setStatus("erro");
      setErro(error.message);
      return;
    }

    setAvisos((data ?? []) as AvisoCuradoria[]);
    setStatus("ok");
  }, []);

  useEffect(() => {
    ativoRef.current = true;
    carregar();

    if (!realtime) return;

    // Nome único por mount — evita erro "cannot add postgres_changes callbacks
    // after subscribe()" quando React StrictMode/HMR remonta o componente e
    // o Supabase Realtime reutiliza o canal antigo pelo mesmo nome.
    const nomeCanal = `curadoria-avisos-${crypto.randomUUID()}`;
    const canal = supabase
      .channel(nomeCanal)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "avisos_curadoria" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (!ativoRef.current) return;
          const novo = payload.new as AvisoCuradoria;
          if (novo.arquivado_em || (novo as unknown as Record<string, unknown>)["deleted_at"]) return;
          setAvisos((atual) => [novo, ...atual]);
        },
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "avisos_curadoria" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (!ativoRef.current) return;
          const atualizado = payload.new as AvisoCuradoria;
          if (atualizado.arquivado_em || (atualizado as unknown as Record<string, unknown>)["deleted_at"]) {
            setAvisos((atual) => atual.filter((a) => a.id !== atualizado.id));
          } else {
            setAvisos((atual) =>
              atual.map((a) => (a.id === atualizado.id ? atualizado : a)),
            );
          }
        },
      )
      .subscribe();

    return () => {
      ativoRef.current = false;
      supabase.removeChannel(canal);
    };
  }, [carregar, realtime]);

  const marcarLido = useCallback(async (id: string) => {
    const agora = new Date().toISOString();
    setAvisos((atual) =>
      atual.map((a) => (a.id === id ? { ...a, lido_em: agora } : a)),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("avisos_curadoria")
      .update({ lido_em: agora })
      .eq("id", id);

    if (error) {
      console.error("[useAvisos] erro ao marcar lido:", error.message);
      setAvisos((atual) =>
        atual.map((a) => (a.id === id ? { ...a, lido_em: null } : a)),
      );
    }
  }, []);

  const arquivar = useCallback(async (id: string) => {
    setAvisos((atual) => atual.filter((a) => a.id !== id));

    const agora = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("avisos_curadoria")
      .update({ arquivado_em: agora })
      .eq("id", id);

    if (error) {
      console.error("[useAvisos] erro ao arquivar aviso:", error.message);
      carregar();
    }
  }, [carregar]);

  return {
    status,
    avisos,
    erro,
    refetch: carregar,
    marcarLido,
    arquivar,
  };
}
