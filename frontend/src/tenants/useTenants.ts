import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tenant no formato consumido pelo bundle (AppTenants).
 * Origem: profiles (LEFT JOIN empresas via user_id).
 */
export type TenantBundle = {
  id: string;
  nome: string;
  email: string;
  phone: string;
  plano: string;
  status: "ativo" | "pendente" | "inativo";
  created: string;
  tokens: number;
  conversas: number;
  avatar: string;
  avatar_url?: string | null;
  cargo?: string;
  cnpj?: string;
  tipo_pessoa?: string;
  chave_pix?: string;
  account_status?: string;
  is_active?: boolean;
  apelido?: string | null;
  plano_id?: string | null;
  plano_status?: string | null;
  plano_expirado?: boolean;
  max_conversas?: number;
  data_expiracao?: string;
  /** Conta de mentoria criada pela ponte do Babel Central (degustação). */
  apresentacao?: boolean;
  degustacao_ate?: string;
};

function iniciais(nome: string): string {
  const partes = (nome || "?").trim().split(/\s+/).filter(Boolean);
  const ini = partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return ini || "?";
}

function mapearStatus(p: any): TenantBundle["status"] {
  if (p.is_active === false) return "inativo";
  const s = (p.account_status || "ativo").toLowerCase();
  if (s === "pendente") return "pendente";
  if (s === "ativo") return "ativo";
  return "inativo";
}

export function useTenants() {
  const [tenants, setTenants] = useState<TenantBundle[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url, account_status, is_active, created_at, cargo, cnpj, tipo_pessoa, chave_pix, system_role, parent_user_id, apelido, metadata")
      .is("parent_user_id", null)
      .not("system_role", "in", '("admin","platform_admin")')
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      setErro(error.message);
      setCarregando(false);
      return;
    }
    const ids = (data || []).map((p: any) => p.id);
    const { data: ass } = ids.length
      ? await supabase
          .from("assinaturas_usuario")
          .select("user_id, plano_nome, plano_id, conversas_usadas, max_conversas, status, data_expiracao, created_at")
          .in("user_id", ids)
          .order("created_at", { ascending: false })
      : { data: [] as any[] };
    const planoPor: Record<string, any> = {};
    for (const a of (ass as any[]) || []) {
      const uid = (a as any).user_id;
      if (!planoPor[uid]) planoPor[uid] = a;
    }
    const lista: TenantBundle[] = (data || []).map((p: any) => {
      const nome = p.full_name || p.email || "Sem nome";
      const a = planoPor[p.id];
      const planoExpirado = a && a.status !== "ativa";
      // Conta de mentoria (ponte Babel Central): categoria Apresentação enquanto
      // estiver em degustação — vira cliente normal quando a ativação confirma.
      const meta = p.metadata || {};
      const apresentacao = meta.origem === "babel-central" && (p.account_status || "") === "pendente";
      return {
        id: p.id,
        nome,
        email: p.email || "",
        phone: p.phone || "",
        plano: a?.plano_nome || "—",
        status: mapearStatus(p),
        created: (p.created_at || "").slice(0, 10),
        tokens: 0,
        conversas: a?.conversas_usadas || 0,
        avatar: iniciais(nome),
        avatar_url: p.avatar_url || null,
        cargo: p.cargo || "",
        cnpj: p.cnpj || "",
        tipo_pessoa: p.tipo_pessoa || "",
        chave_pix: p.chave_pix || "",
        account_status: p.account_status || "active",
        is_active: p.is_active !== false,
        apelido: p.apelido || null,
        plano_id: a?.plano_id || null,
        plano_status: a?.status || null,
        plano_expirado: !!planoExpirado,
        max_conversas: a?.max_conversas || 0,
        data_expiracao: (a?.data_expiracao || "").slice(0, 10),
        apresentacao,
        degustacao_ate: (meta.degustacao_ate || "").slice(0, 10),
      };
    });
    setTenants(lista);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { tenants, carregando, erro, recarregar: carregar };
}