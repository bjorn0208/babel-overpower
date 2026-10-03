/**
 * Pastas da Base — grupos de contatos (nível único, 1 pasta por contato).
 * CRUD direto no Supabase (RLS cobre); mover contato = update `leads.pasta_base_id`.
 * Contato que volta pro Conversas segue na pasta (decisão Theus 2026-07-05) —
 * o chip lá é tag viva puxada do nome daqui.
 */
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBruto = any;

export interface PastaBase {
  id: string;
  nome: string;
  criado_em: string;
}

export async function listarPastas(tenantId: string): Promise<PastaBase[]> {
  const sb = supabase as SupabaseBruto;
  const { data, error } = await sb
    .from("pastas_base")
    .select("id, nome, criado_em")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("criado_em");
  if (error) throw error;
  return (data ?? []) as PastaBase[];
}

export async function criarPasta(tenantId: string, nome: string): Promise<void> {
  const sb = supabase as SupabaseBruto;
  const { error } = await sb.from("pastas_base").insert({ tenant_id: tenantId, nome });
  if (error) throw error;
}

export async function renomearPasta(pastaId: string, nome: string): Promise<void> {
  const sb = supabase as SupabaseBruto;
  const { error } = await sb.from("pastas_base").update({ nome }).eq("id", pastaId);
  if (error) throw error;
}

/** Soft delete da pasta; contatos dela ficam soltos (`pasta_base_id=null`). */
export async function excluirPasta(pastaId: string): Promise<void> {
  const sb = supabase as SupabaseBruto;
  const { error: erroDesvincular } = await sb
    .from("leads")
    .update({ pasta_base_id: null })
    .eq("pasta_base_id", pastaId);
  if (erroDesvincular) throw erroDesvincular;
  const { error } = await sb
    .from("pastas_base")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", pastaId);
  if (error) throw error;
}

/** Move contato pra pasta (`null` = tirar da pasta). */
export async function moverContatoParaPasta(leadId: string, pastaId: string | null): Promise<void> {
  const sb = supabase as SupabaseBruto;
  const { error } = await sb.from("leads").update({ pasta_base_id: pastaId }).eq("id", leadId);
  if (error) throw error;
}
