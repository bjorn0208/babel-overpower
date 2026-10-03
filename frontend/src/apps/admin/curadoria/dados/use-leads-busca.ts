import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LeadBuscaItem {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  tenant_id: string;
  pipeline_stage: string | null;
  desfecho: string | null;
  total_mensagens: number | null;
}

interface Estado {
  status: "ocioso" | "carregando" | "ok" | "erro";
  leads: LeadBuscaItem[];
  erro: string | null;
}

export function useLeadsBusca(
  tenantId: string | null | undefined,
  query: string,
): Estado {
  const [estado, setEstado] = useState<Estado>({
    status: "ocioso",
    leads: [],
    erro: null,
  });

  useEffect(() => {
    if (!tenantId) {
      setEstado({ status: "ocioso", leads: [], erro: null });
      return;
    }

    const q = query.trim();

    let ativo = true;
    setEstado((e) => ({ ...e, status: "carregando" }));

    async function buscar() {
      try {
        let req = (supabase as any)
          .from("leads")
          .select("id, nome, telefone, email, tenant_id, pipeline_stage, desfecho, total_mensagens")
          .eq("tenant_id", tenantId)
          .is("deleted_at", null)
          .limit(30);

        if (q) {
          // busca por nome OU telefone
          req = req.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%,email.ilike.%${q}%`);
        } else {
          req = req.order("atualizado_em", { ascending: false });
        }

        const { data, error } = await req;
        if (!ativo) return;

        if (error) {
          console.warn("[useLeadsBusca] erro:", error.message);
          setEstado({ status: "erro", leads: [], erro: error.message });
          return;
        }

        setEstado({ status: "ok", leads: (data ?? []) as LeadBuscaItem[], erro: null });
      } catch (err: unknown) {
        if (!ativo) return;
        const msg = err instanceof Error ? err.message : "erro desconhecido";
        setEstado({ status: "erro", leads: [], erro: msg });
      }
    }

    const timer = setTimeout(buscar, q ? 300 : 0);
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [tenantId, query]);

  return estado;
}
