import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CandidatoBloco } from "./tipos";

interface Estado {
  status: "carregando" | "ok" | "erro";
  candidatos: CandidatoBloco[];
  erro: string | null;
}

export function useCandidatosBloco(): Estado & {
  refetch: () => void;
  decidir: (id: string, status: "aprovado" | "recusado") => Promise<void>;
} {
  const [estado, setEstado] = useState<Estado>({ status: "carregando", candidatos: [], erro: null });
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let ativo = true;
    setEstado((e) => ({ ...e, status: "carregando" }));

    async function carregar() {
      try {
        const { data, error } = await (supabase as any)
          .from("candidatos_bloco")
          .select("*")
          .order("criado_em", { ascending: false })
          .limit(100);

        if (!ativo) return;

        if (error) {
          console.warn("[useCandidatosBloco] erro:", error.message);
          setEstado({ status: "erro", candidatos: [], erro: error.message });
          return;
        }

        setEstado({ status: "ok", candidatos: (data ?? []) as CandidatoBloco[], erro: null });
      } catch (err: unknown) {
        if (!ativo) return;
        const msg = err instanceof Error ? err.message : "erro desconhecido";
        setEstado({ status: "erro", candidatos: [], erro: msg });
      }
    }

    carregar();
    return () => { ativo = false; };
  }, [rev]);

  const decidir = useCallback(async (id: string, novoStatus: "aprovado" | "recusado") => {
    const agora = new Date().toISOString();
    // otimista
    setEstado((e) => ({
      ...e,
      candidatos: e.candidatos.map((c) =>
        c.id === id ? { ...c, status: novoStatus, decidido_em: agora } : c,
      ),
    }));

    const { error } = await (supabase as any)
      .from("candidatos_bloco")
      .update({ status: novoStatus, decidido_em: agora })
      .eq("id", id);

    if (error) {
      console.warn("[useCandidatosBloco] erro ao decidir:", error.message);
      setRev((r) => r + 1); // rollback via refetch
    }
  }, []);

  return { ...estado, refetch: () => setRev((r) => r + 1), decidir };
}
