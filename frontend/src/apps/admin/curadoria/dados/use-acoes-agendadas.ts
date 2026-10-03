import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AcaoAgendadaItem {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  tipo: string;
  mensagem: string | null;
  carga: Record<string, unknown> | null;
  created_at?: string | null;
  agendado_para: string;
  status: string;
  criado_em: string;
}

interface Estado {
  status: "carregando" | "ok" | "erro";
  acoes: AcaoAgendadaItem[];
  erro: string | null;
}

export function useAcoesAgendadas(
  tenantId?: string | null,
  tipoFiltro = "todos",
): Estado & { refetch: () => void; cancelar: (id: string) => Promise<void> } {
  const [estado, setEstado] = useState<Estado>({ status: "carregando", acoes: [], erro: null });
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let ativo = true;
    setEstado((e) => ({ ...e, status: "carregando" }));

    async function carregar() {
      try {
        let q = (supabase as any)
          .from("acoes_agendadas")
          .select("id, tenant_id, lead_id, tipo:action_type, agendado_para:scheduled_at, status, criado_em:created_at, carga")
          .order("scheduled_at", { ascending: true })
          .limit(100);

        if (tenantId) q = q.eq("tenant_id", tenantId);
        if (tipoFiltro !== "todos") q = q.eq("action_type", tipoFiltro);

        const { data, error } = await q;
        if (!ativo) return;

        if (error) {
          console.warn("[useAcoesAgendadas] erro:", error.message);
          setEstado({ status: "erro", acoes: [], erro: error.message });
          return;
        }

        setEstado({ status: "ok", acoes: (data ?? []) as AcaoAgendadaItem[], erro: null });
      } catch (err: unknown) {
        if (!ativo) return;
        const msg = err instanceof Error ? err.message : "erro desconhecido";
        setEstado({ status: "erro", acoes: [], erro: msg });
      }
    }

    carregar();
    return () => { ativo = false; };
  }, [tenantId, tipoFiltro, rev]);

  const cancelar = useCallback(async (id: string) => {
    setEstado((e) => ({ ...e, acoes: e.acoes.filter((a) => a.id !== id) }));
    const { error } = await (supabase as any)
      .from("acoes_agendadas")
      .update({ status: "cancelado" })
      .eq("id", id);
    if (error) {
      console.warn("[useAcoesAgendadas] erro ao cancelar:", error.message);
      setRev((r) => r + 1);
    }
  }, []);

  return { ...estado, refetch: () => setRev((r) => r + 1), cancelar };
}
