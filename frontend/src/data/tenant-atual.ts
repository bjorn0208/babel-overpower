/**
 * Resolve o TENANT da sessão: o dono da conta, não o usuário logado.
 *
 * Δ 2026-09-17 (varredura): Financeiro, Rifas, Contratos, Consulta e Produtos
 * usavam o `uid` do logado como tenant. Para MEMBRO DE EQUIPE isso quebrava
 * duas vezes: a lista vinha vazia (os dados são do dono) e o que ele criava
 * nascia com `tenant_id`/`owner_id` = uid dele, invisível pro dono.
 * Base, Campanha e Conversas já resolviam certo — este helper é aquela mesma
 * regra num lugar só.
 */

import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

export interface TenantAtual {
  /** id do dono da conta — use para filtrar e para gravar */
  tenantId: string | null;
  /** id do usuário logado (pode ser um membro da equipe) */
  uid: string | null;
  /** true quando o logado é membro de equipe, não o dono */
  ehMembro: boolean;
}

/** Sessão + `profiles.parent_user_id`. Nunca lança: devolve nulos se não houver sessão. */
export async function obterTenantAtual(sbOpcional?: SupabaseBruto): Promise<TenantAtual> {
  const sb = (sbOpcional ?? supabase) as SupabaseBruto;
  const { data: sessao } = await sb.auth.getSession();
  const uid: string | null = sessao?.session?.user?.id ?? null;
  if (!uid) return { tenantId: null, uid: null, ehMembro: false };

  const { data: perfil, error } = await sb
    .from("profiles")
    .select("parent_user_id")
    .eq("id", uid)
    .maybeSingle();
  if (error) {
    // Falha de leitura não pode virar "sou o dono": isso faria o membro gravar
    // no lugar errado. Sem resposta confiável, o app trata como sem tenant.
    console.error("[tenant-atual] não consegui resolver o dono da conta:", error);
    return { tenantId: null, uid, ehMembro: false };
  }
  const pai = (perfil?.parent_user_id as string | null) ?? null;
  return { tenantId: pai ?? uid, uid, ehMembro: !!pai };
}

/** Atalho quando só o id do dono importa. */
export async function obterTenantId(sbOpcional?: SupabaseBruto): Promise<string | null> {
  return (await obterTenantAtual(sbOpcional)).tenantId;
}
