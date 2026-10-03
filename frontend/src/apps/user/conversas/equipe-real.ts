/**
 * Equipe real do tenant — fonte única pro dropdown "Responsável".
 *
 * Busca DIRETO em `profiles` (dono logado + subordinados por `parent_user_id`),
 * mesmo padrão do app Equipe / useConversasLive. Extraído do `Conversas.tsx`
 * em 2026-08-09 porque a janela de conversa isolada não conseguia reusar a
 * função privada e acabou renderizando `EQUIPE_MOCK` no lugar da equipe real.
 */

import { supabase } from "@/integrations/supabase/client";
import type { AutorHumano, MembroEquipe } from "./tipos";

export async function buscarEquipeReal(): Promise<MembroEquipe[]> {
  const { data: sessao } = await supabase.auth.getSession();
  const uid = sessao?.session?.user?.id;
  if (!uid) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  // Próprio dono (id = uid) + subordinados (parent_user_id = uid).
  const { data, error } = await sb
    .from("profiles")
    .select("id, full_name, email, cargo, avatar_url, is_active, created_at")
    .or(`id.eq.${uid},parent_user_id.eq.${uid}`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[Conversas] equipe:", error.message);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membros: MembroEquipe[] = (data ?? []).map((m: any) => ({
    id: String(m.id),
    nome:
      m.id === uid
        ? `${m.full_name || m.email || "Você"} (você)`
        : m.full_name || m.email || "Sem nome",
    cargo_funcional: (m.cargo && String(m.cargo).trim()) || (m.id === uid ? "Dono da conta" : "Membro"),
    foto_url: m.avatar_url ?? undefined,
    ativo: m.id === uid ? true : m.is_active !== false,
  }));
  // Dono sempre no topo da lista.
  return membros.sort((a, b) => (a.id === uid ? -1 : b.id === uid ? 1 : 0));
}

/**
 * Perfil do usuário logado (dono OU membro da equipe) pra carimbar o autor
 * na mensagem enviada pelo painel. Grava `carga.sender` SEM `source`, então a
 * regra de exibição classifica como humano identificado (o eco vindo do
 * WhatsApp do celular chega com `source: 'whatsapp_app'`).
 */
export async function buscarPerfilAutor(): Promise<AutorHumano | null> {
  const { data: sessao } = await supabase.auth.getSession();
  const uid = sessao?.session?.user?.id;
  if (!uid) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb
    .from("profiles")
    .select("id, full_name, email, cargo, avatar_url")
    .eq("id", uid)
    .single();
  if (error || !data) return null;
  return {
    id: String(data.id),
    nome: data.full_name || data.email || "Atendente",
    cargo: data.cargo ?? null,
    foto_url: data.avatar_url ?? null,
  };
}
