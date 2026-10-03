import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TenantImpersonavelLive {
  id: string;
  nome: string;
  email: string | null;
  avatar_url: string | null;
  nicho_nome: string | null;
  nicho_id: string | null;
  leads: number;
}

interface Estado {
  status: "carregando" | "ok" | "erro";
  tenants: TenantImpersonavelLive[];
  erro: string | null;
}

export function useTenantsImpersonaveis(): Estado {
  const [estado, setEstado] = useState<Estado>({
    status: "carregando",
    tenants: [],
    erro: null,
  });

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      // 1. Busca todos os tenants raiz (sem parent_user_id) exceto platform_admin
      const { data: perfis, error: erroPerfis } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, nicho_id, razao_social")
        .is("parent_user_id", null)
        .is("deletion_requested_at", null)
        .neq("system_role", "platform_admin");

      if (!ativo) return;

      if (erroPerfis) {
        console.error("[useTenantsImpersonaveis] erro ao carregar profiles:", erroPerfis.message);
        setEstado({ status: "erro", tenants: [], erro: erroPerfis.message });
        return;
      }

      if (!perfis || perfis.length === 0) {
        setEstado({ status: "ok", tenants: [], erro: null });
        return;
      }

      // 2. Busca nichos para montar nome
      const nichoIds = [...new Set(perfis.map((p) => p.nicho_id).filter(Boolean))] as string[];
      let nichoMap: Record<string, string> = {};

      if (nichoIds.length > 0) {
        const { data: nichos } = await supabase
          .from("nichos")
          .select("id, nome_exibicao")
          .in("id", nichoIds);

        if (nichos && ativo) {
          nichoMap = Object.fromEntries(nichos.map((n) => [n.id, n.nome_exibicao as string]));
        }
      }

      if (!ativo) return;

      // 3. Conta leads por tenant em batch
      const tenantIds = perfis.map((p) => p.id);
      const { data: contagemLeads } = await supabase
        .from("leads")
        .select("tenant_id")
        .in("tenant_id", tenantIds)
        .is("deleted_at", null);

      if (!ativo) return;

      const leadsPorTenant: Record<string, number> = {};
      for (const row of contagemLeads ?? []) {
        if (!row.tenant_id) continue;
        leadsPorTenant[row.tenant_id] = (leadsPorTenant[row.tenant_id] ?? 0) + 1;
      }

      const tenants: TenantImpersonavelLive[] = perfis
        .map((p) => ({
          id: p.id,
          nome: (p.full_name || p.razao_social || "Sem nome") as string,
          email: p.email ?? null,
          avatar_url: p.avatar_url ?? null,
          nicho_id: p.nicho_id ?? null,
          nicho_nome: p.nicho_id ? (nichoMap[p.nicho_id] ?? null) : null,
          leads: leadsPorTenant[p.id] ?? 0,
        }))
        .sort((a, b) => b.leads - a.leads);

      setEstado({ status: "ok", tenants, erro: null });
    }

    carregar();
    return () => {
      ativo = false;
    };
  }, []);

  return estado;
}
