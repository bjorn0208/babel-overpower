import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CargoResumoItem {
  id: string;
  nome: string;
  objetivo: string | null;
  tipologia: string | null;
  escopo: string;
  canal_atuacao: string | null;
  modelo_llm_padrao: string | null;
  ativo: boolean;
  tenant_id: string | null;
  nicho_id: string | null;
}

interface Estado {
  status: "carregando" | "ok" | "erro";
  cargos: CargoResumoItem[];
  erro: string | null;
}

export function useCargosResumo(tenantId?: string | null): Estado & { refetch: () => void } {
  const [estado, setEstado] = useState<Estado>({ status: "carregando", cargos: [], erro: null });
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let ativo = true;
    setEstado((e) => ({ ...e, status: "carregando" }));

    async function carregar() {
      try {
        let q = (supabase as any)
          .from("cargos")
          .select("id, nome, objetivo:objetivo_principal, tipologia, escopo, canal_atuacao, modelo_llm_padrao, ativo, tenant_id, nicho_id")
          .order("nome");

        if (tenantId) q = q.eq("tenant_id", tenantId);

        const { data, error } = await q;
        if (!ativo) return;
        if (error) {
          console.warn("[useCargosResumo] erro:", error.message);
          setEstado({ status: "erro", cargos: [], erro: error.message });
          return;
        }
        setEstado({ status: "ok", cargos: (data ?? []) as CargoResumoItem[], erro: null });
      } catch (err: unknown) {
        if (!ativo) return;
        const msg = err instanceof Error ? err.message : "erro desconhecido";
        setEstado({ status: "erro", cargos: [], erro: msg });
      }
    }

    carregar();
    return () => { ativo = false; };
  }, [tenantId, rev]);

  return { ...estado, refetch: () => setRev((r) => r + 1) };
}
