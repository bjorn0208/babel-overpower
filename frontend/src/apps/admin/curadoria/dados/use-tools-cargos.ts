import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FerramentaItem {
  id: string;
  nome: string;
  descricao: string | null;
  schema_args: Record<string, unknown> | null;
  ativo: boolean;
  tenant_id: string | null;
  escopo: string;
}

export interface CargoFerramenta {
  cargo_id: string;
  ferramenta_id: string;
}

interface Estado {
  status: "carregando" | "ok" | "erro";
  ferramentas: FerramentaItem[];
  cargoFerramentas: CargoFerramenta[];
  erro: string | null;
}

export function useToolsCargos(tenantId?: string | null): Estado & {
  refetch: () => void;
  setFerramentas: (updater: (fs: FerramentaItem[]) => FerramentaItem[]) => void;
  vinculosCargo: CargoFerramenta[];
  toggleAtivoFerramenta: (id: string, ativo: boolean) => Promise<void>;
} {
  const [estado, setEstado] = useState<Estado>({
    status: "carregando",
    ferramentas: [],
    cargoFerramentas: [],
    erro: null,
  });
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let ativo = true;
    setEstado((e) => ({ ...e, status: "carregando" }));

    async function carregar() {
      try {
        let fq = (supabase as any)
          .from("ferramentas_dinamicas")
          .select("id, nome:nome_tool, descricao, schema_args:schema_zod, ativo, tenant_id, escopo")
          .order("nome_tool");

        if (tenantId) fq = fq.or(`tenant_id.eq.${tenantId},escopo.eq.global`);

        const [ferrRes, cfRes] = await Promise.all([
          fq,
          (supabase as any).from("cargo_ferramentas").select("cargo_id, ferramenta_id"),
        ]);

        if (!ativo) return;

        if (ferrRes.error) {
          console.warn("[useToolsCargos] erro ferramentas:", ferrRes.error.message);
          setEstado({ status: "erro", ferramentas: [], cargoFerramentas: [], erro: ferrRes.error.message });
          return;
        }

        setEstado({
          status: "ok",
          ferramentas: (ferrRes.data ?? []) as FerramentaItem[],
          cargoFerramentas: (cfRes.data ?? []) as CargoFerramenta[],
          erro: null,
        });
      } catch (err: unknown) {
        if (!ativo) return;
        const msg = err instanceof Error ? err.message : "erro desconhecido";
        setEstado({ status: "erro", ferramentas: [], cargoFerramentas: [], erro: msg });
      }
    }

    carregar();
    return () => { ativo = false; };
  }, [tenantId, rev]);

  const setFerramentas = (updater: (fs: FerramentaItem[]) => FerramentaItem[]) =>
    setEstado((e) => ({ ...e, ferramentas: updater(e.ferramentas) }));

  const toggleAtivoFerramenta = async (id: string, ativo: boolean) => {
    // otimista
    setFerramentas((fs) => fs.map((f) => (f.id === id ? { ...f, ativo } : f)));
    const { error } = await (supabase as any)
      .from("ferramentas_dinamicas")
      .update({ ativo })
      .eq("id", id);
    if (error) {
      console.error("[useToolsCargos] erro toggle ativo:", error.message);
      // rollback
      setFerramentas((fs) => fs.map((f) => (f.id === id ? { ...f, ativo: !ativo } : f)));
    }
  };

  return {
    ...estado,
    vinculosCargo: estado.cargoFerramentas,
    refetch: () => setRev((r) => r + 1),
    setFerramentas,
    toggleAtivoFerramenta,
  };
}
