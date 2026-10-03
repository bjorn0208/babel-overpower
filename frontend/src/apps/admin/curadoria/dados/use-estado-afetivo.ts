import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EstadoAfetivoItem {
  id: string;
  lead_id: string;
  tenant_id: string;
  valencia: number;
  ativacao: number;
  confianca: number;
  atualizado_em: string;
  lead_nome?: string | null;
}

export interface MapaEmocaoAfetoItem {
  emocao: string;
  afeto: number; // -1 | 0 | 1
}

interface Estado {
  status: "carregando" | "ok" | "erro";
  topPositivo: EstadoAfetivoItem[];
  topNegativo: EstadoAfetivoItem[];
  mapaEmocao: MapaEmocaoAfetoItem[];
  erro: string | null;
}

// 19 emoções canônicas com afeto padrão
export const EMOCOES_PADRAO: MapaEmocaoAfetoItem[] = [
  { emocao: "alegria", afeto: 1 },
  { emocao: "entusiasmo", afeto: 1 },
  { emocao: "gratidao", afeto: 1 },
  { emocao: "curiosidade", afeto: 1 },
  { emocao: "confianca", afeto: 1 },
  { emocao: "esperanca", afeto: 1 },
  { emocao: "surpresa", afeto: 0 },
  { emocao: "neutro", afeto: 0 },
  { emocao: "confusao", afeto: 0 },
  { emocao: "hesitacao", afeto: 0 },
  { emocao: "indiferenca", afeto: 0 },
  { emocao: "impaciencia", afeto: -1 },
  { emocao: "frustacao", afeto: -1 },
  { emocao: "desconfianca", afeto: -1 },
  { emocao: "ansiedade", afeto: -1 },
  { emocao: "tristeza", afeto: -1 },
  { emocao: "raiva", afeto: -1 },
  { emocao: "decepção", afeto: -1 },
  { emocao: "vergonha", afeto: -1 },
];

export function useEstadoAfetivo(tenantId?: string | null): Estado & { refetch: () => void } {
  const [estado, setEstado] = useState<Estado>({
    status: "carregando",
    topPositivo: [],
    topNegativo: [],
    mapaEmocao: EMOCOES_PADRAO,
    erro: null,
  });
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let ativo = true;
    setEstado((e) => ({ ...e, status: "carregando" }));

    async function carregar() {
      try {
        let q = (supabase as any)
          .from("estado_afetivo_lead")
          .select("id, lead_id, tenant_id, valencia, ativacao, confianca, atualizado_em")
          .order("atualizado_em", { ascending: false })
          .limit(60);

        if (tenantId) q = q.eq("tenant_id", tenantId);

        const { data, error } = await q;

        if (!ativo) return;

        if (error) {
          console.warn("[useEstadoAfetivo] erro:", error.message);
          setEstado((e) => ({ ...e, status: "erro", erro: error.message }));
          return;
        }

        const itens = (data ?? []) as EstadoAfetivoItem[];
        const sorted = [...itens].sort((a, b) => b.valencia - a.valencia);
        const topPositivo = sorted.filter((i) => i.valencia > 0.2).slice(0, 5);
        const topNegativo = sorted
          .filter((i) => i.valencia < -0.2)
          .reverse()
          .slice(0, 5);

        setEstado((e) => ({
          ...e,
          status: "ok",
          topPositivo,
          topNegativo,
          erro: null,
        }));
      } catch (err: unknown) {
        if (!ativo) return;
        const msg = err instanceof Error ? err.message : "erro desconhecido";
        setEstado((e) => ({ ...e, status: "erro", erro: msg }));
      }
    }

    carregar();
    return () => { ativo = false; };
  }, [tenantId, rev]);

  return { ...estado, refetch: () => setRev((r) => r + 1) };
}
