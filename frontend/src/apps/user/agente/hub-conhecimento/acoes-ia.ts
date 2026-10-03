/**
 * Ações de banco da caixa "Sugestões da análise de conversas"
 * (`blocos_conhecimento` com `tag='analise_conversas_ia'`).
 *
 * Diferente de `acoes-gaveta.ts`: aqui os blocos nascem `ativo=false`
 * (pendente de aprovação) — o tenant aprova, melhora ou exclui.
 */

import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type SugestaoIA = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[] | null;
  ativo: boolean;
};

export async function listarSugestoesIA(agenteId: string): Promise<SugestaoIA[]> {
  const { data, error } = await sb
    .from("blocos_conhecimento")
    .select("id, title, content, category, tags, ativo")
    .eq("agente_id", agenteId)
    .eq("tag", "analise_conversas_ia")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SugestaoIA[];
}

export async function aprovarSugestaoIA(id: string): Promise<void> {
  const { error } = await sb.from("blocos_conhecimento").update({ ativo: true }).eq("id", id);
  if (error) throw error;
}

export async function excluirSugestaoIA(id: string): Promise<void> {
  const { error } = await sb
    .from("blocos_conhecimento")
    .update({ deleted_at: new Date().toISOString(), ativo: false })
    .eq("id", id);
  if (error) throw error;
}

export async function atualizarConteudoSugestaoIA(id: string, content: string): Promise<void> {
  const { error } = await sb.from("blocos_conhecimento").update({ content }).eq("id", id);
  if (error) throw error;
}
