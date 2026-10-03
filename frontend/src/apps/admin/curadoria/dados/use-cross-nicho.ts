import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PerfilEmpresaItem {
  tenant_id: string;
  segmento: string | null;
  taxa_conversao_estimada: number | null;
  conversas_destiladas: number;
  destilacao_ultima_em: string | null;
  versao: number;
}

export interface ComparativoNichoItem {
  id: string;
  nicho_id: string;
  metrica: string;
  valor_anonimizado: any;
  count_tenants: number;
  epsilon: number;
  janela_dias: number;
  calculado_em: string;
}

export interface UseCrossNichoResultado {
  status: "carregando" | "ok" | "erro";
  perfilEmpresa: PerfilEmpresaItem | null;
  comparativos: ComparativoNichoItem[];
  erro: string | null;
  destilar: () => Promise<void>;
}

export function useCrossNicho(tenantId: string | null): UseCrossNichoResultado {
  const [status, setStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [perfilEmpresa, setPerfilEmpresa] = useState<PerfilEmpresaItem | null>(null);
  const [comparativos, setComparativos] = useState<ComparativoNichoItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const ativoRef = useRef(true);

  const carregar = useCallback(async () => {
    setStatus("carregando");
    setErro(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    if (!tenantId) {
      // sem tenant: só pega comparativos disponíveis
      const compRes = await sb.from("comparativo_nicho").select("*").limit(20);
      if (!ativoRef.current) return;
      if (compRes.error) {
        setStatus("erro");
        setErro(compRes.error.message);
        return;
      }
      setPerfilEmpresa(null);
      setComparativos((compRes.data ?? []) as ComparativoNichoItem[]);
      setStatus("ok");
      return;
    }

    const [perfilRes, compRes] = await Promise.all([
      sb.from("perfil_empresa").select("*").eq("tenant_id", tenantId).maybeSingle(),
      sb.from("comparativo_nicho").select("*").limit(20),
    ]);

    if (!ativoRef.current) return;

    if (perfilRes.error && perfilRes.error.code !== "PGRST116") {
      setStatus("erro");
      setErro(perfilRes.error.message);
      return;
    }

    setPerfilEmpresa((perfilRes.data ?? null) as PerfilEmpresaItem | null);
    setComparativos((compRes.data ?? []) as ComparativoNichoItem[]);
    setStatus("ok");
  }, [tenantId]);

  useEffect(() => {
    ativoRef.current = true;
    carregar();
    return () => {
      ativoRef.current = false;
    };
  }, [carregar]);

  const destilar = useCallback(async () => {
    if (!tenantId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("destilar_perfil_empresa", { p_tenant_id: tenantId });
    if (error) {
      console.error("[useCrossNicho] erro destilar:", error.message);
      setErro(error.message);
      return;
    }
    await carregar();
  }, [tenantId, carregar]);

  return { status, perfilEmpresa, comparativos, erro, destilar };
}
