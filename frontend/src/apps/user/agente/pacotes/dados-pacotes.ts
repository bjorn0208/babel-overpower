/**
 * Pacotes de Conhecimento — acesso ao banco (tenant e admin).
 * Tabelas: pacotes_conhecimento, pacotes_conhecimento_blocos, pacotes_conhecimento_ativacao.
 * A RLS decide o que cada um vê/edita; o trigger da ativação barra ligar pacote de Loja
 * não instalado — a UI só evita chegar lá.
 *
 * Nada aqui apaga de verdade: excluir = `deleted_at` (soft delete, desliga junto).
 */

import { supabase } from "@/integrations/supabase/client";
import {
  montarLinhaBloco,
  type BlocoPacote,
  type Pacote,
  type ValoresBlocoPacote,
} from "./logica-pacotes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const COLS_PACOTE =
  "id, nome, descricao, icone, cor, origem, tenant_id, nicho_id, loja_aplicativo_id, ativo, ordem, updated_at";
const COLS_BLOCO =
  "id, pacote_id, titulo, conteudo, modo, category, tags, ordem, ativo, embedding_status, updated_at";

export type ValoresPacote = { nome: string; descricao: string; nicho_id?: string | null };

/* ── leitura ─────────────────────────────────────────────────────────── */

/** Pacotes visíveis ao usuário logado (a RLS filtra: tenant vê os dele + os da Babel do nicho). */
export async function listarPacotes(): Promise<Pacote[]> {
  const { data, error } = await sb
    .from("pacotes_conhecimento")
    .select(COLS_PACOTE)
    .is("deleted_at", null)
    .order("origem", { ascending: true })
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Pacote[];
}

/** Blocos de vários pacotes de uma vez (a RLS esconde conteúdo de pacote de Loja não instalado). */
export async function listarBlocos(pacoteIds: string[]): Promise<BlocoPacote[]> {
  if (!pacoteIds.length) return [];
  const { data, error } = await sb
    .from("pacotes_conhecimento_blocos")
    .select(COLS_BLOCO)
    .in("pacote_id", pacoteIds)
    .is("deleted_at", null)
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BlocoPacote[];
}

/** Estado ON/OFF por pacote para um agente. */
export async function listarAtivacoes(agenteId: string): Promise<Record<string, boolean>> {
  const { data, error } = await sb
    .from("pacotes_conhecimento_ativacao")
    .select("pacote_id, ligado")
    .eq("agente_id", agenteId);
  if (error) throw error;
  const mapa: Record<string, boolean> = {};
  for (const r of data ?? []) mapa[r.pacote_id] = r.ligado === true;
  return mapa;
}

/** ids de loja_aplicativos instalados pelo tenant. */
export async function listarInstalacoes(tenantId: string): Promise<Set<string>> {
  const { data, error } = await sb
    .from("aplicativos_instalados")
    .select("aplicativo_id")
    .eq("user_id", tenantId);
  if (error) throw error;
  return new Set((data ?? []).map((r: { aplicativo_id: string }) => r.aplicativo_id));
}

/* ── ativação ────────────────────────────────────────────────────────── */

export async function alternarPacote(
  pacoteId: string,
  agenteId: string,
  tenantId: string,
  ligado: boolean,
): Promise<void> {
  const { error } = await sb
    .from("pacotes_conhecimento_ativacao")
    .upsert(
      { pacote_id: pacoteId, agente_id: agenteId, tenant_id: tenantId, ligado },
      { onConflict: "pacote_id,agente_id" },
    );
  if (error) throw error;
}

/* ── pacotes ─────────────────────────────────────────────────────────── */

export async function criarPacoteTenant(tenantId: string, v: ValoresPacote): Promise<Pacote> {
  const { data, error } = await sb
    .from("pacotes_conhecimento")
    .insert({
      nome: v.nome.trim(),
      descricao: v.descricao.trim(),
      origem: "tenant",
      tenant_id: tenantId,
    })
    .select(COLS_PACOTE)
    .single();
  if (error) throw error;
  return data as Pacote;
}

export async function criarPacoteAdmin(v: ValoresPacote): Promise<Pacote> {
  const { data, error } = await sb
    .from("pacotes_conhecimento")
    .insert({
      nome: v.nome.trim(),
      descricao: v.descricao.trim(),
      origem: "admin",
      nicho_id: v.nicho_id ?? null,
    })
    .select(COLS_PACOTE)
    .single();
  if (error) throw error;
  return data as Pacote;
}

export async function editarPacote(id: string, v: ValoresPacote): Promise<void> {
  const patch: Record<string, unknown> = { nome: v.nome.trim(), descricao: v.descricao.trim() };
  if (v.nicho_id !== undefined) patch.nicho_id = v.nicho_id;
  const { error } = await sb.from("pacotes_conhecimento").update(patch).eq("id", id);
  if (error) throw error;
}

export async function alternarAtivoPacote(id: string, ativo: boolean): Promise<void> {
  const { error } = await sb.from("pacotes_conhecimento").update({ ativo }).eq("id", id);
  if (error) throw error;
}

export async function excluirPacote(id: string): Promise<void> {
  const { error } = await sb
    .from("pacotes_conhecimento")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/* ── blocos ──────────────────────────────────────────────────────────── */

export async function criarBlocoPacote(
  pacoteId: string,
  v: ValoresBlocoPacote,
  ordem: number,
): Promise<void> {
  const { error } = await sb
    .from("pacotes_conhecimento_blocos")
    .insert({ ...montarLinhaBloco(v), pacote_id: pacoteId, ordem });
  if (error) throw error;
}

export async function editarBlocoPacote(id: string, v: ValoresBlocoPacote): Promise<void> {
  const { error } = await sb
    .from("pacotes_conhecimento_blocos")
    .update(montarLinhaBloco(v))
    .eq("id", id);
  if (error) throw error;
}

export async function alternarAtivoBlocoPacote(id: string, ativo: boolean): Promise<void> {
  const { error } = await sb.from("pacotes_conhecimento_blocos").update({ ativo }).eq("id", id);
  if (error) throw error;
}

export async function excluirBlocoPacote(id: string): Promise<void> {
  const { error } = await sb
    .from("pacotes_conhecimento_blocos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/* ── admin ───────────────────────────────────────────────────────────── */

export type ItemLoja = { id: string; preco_mensal: number | null; is_active: boolean };

export async function lerItensLoja(ids: string[]): Promise<Record<string, ItemLoja>> {
  if (!ids.length) return {};
  const { data, error } = await sb
    .from("loja_aplicativos")
    .select("id, preco_mensal, is_active")
    .in("id", ids);
  if (error) throw error;
  const mapa: Record<string, ItemLoja> = {};
  for (const r of data ?? []) mapa[r.id] = r as ItemLoja;
  return mapa;
}

export async function publicarNaLoja(
  pacoteId: string,
  precoMensal: number | null,
  publicado: boolean,
): Promise<void> {
  const { error } = await sb.rpc("admin_publicar_pacote_loja", {
    p_pacote_id: pacoteId,
    p_preco_mensal: precoMensal,
    p_publicado: publicado,
  });
  if (error) throw error;
}

export type UsoPacote = {
  tenant_id: string;
  tenant_nome: string;
  instalado: boolean;
  agentes_ligados: number;
};

export async function lerUsoPacote(pacoteId: string): Promise<UsoPacote[]> {
  const { data, error } = await sb.rpc("admin_uso_pacote", { p_pacote_id: pacoteId });
  if (error) throw error;
  return (data ?? []) as UsoPacote[];
}

export async function liberarParaTenant(
  pacoteId: string,
  tenantId: string,
  liberar: boolean,
): Promise<void> {
  const { error } = await sb.rpc("admin_liberar_pacote_tenant", {
    p_pacote_id: pacoteId,
    p_tenant_id: tenantId,
    p_liberar: liberar,
  });
  if (error) throw error;
}

export type OpcaoSimples = { id: string; nome: string };

export async function listarNichos(): Promise<OpcaoSimples[]> {
  const { data, error } = await sb
    .from("nichos")
    .select("id, nome_exibicao")
    .eq("ativo", true)
    .order("nome_exibicao");
  if (error) throw error;
  return (data ?? []).map((n: { id: string; nome_exibicao: string }) => ({
    id: n.id,
    nome: n.nome_exibicao,
  }));
}

export async function listarTenants(): Promise<OpcaoSimples[]> {
  const { data, error } = await sb
    .from("profiles")
    .select("id, full_name, email")
    .neq("system_role", "platform_admin")
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => ({
    id: p.id,
    nome: p.full_name || p.email || p.id,
  }));
}

/** Mensagem legível para erros do banco (RLS/CHECK/trigger). */
export function mensagemErro(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  if (/instale na Loja/i.test(msg)) return "Instale este pacote na Loja antes de ligar.";
  if (/pacotes_blocos_tamanho_check/.test(msg))
    return "Conteúdo acima do limite do modo escolhido.";
  if (/row-level security/i.test(msg)) return "Você não tem permissão para esta ação.";
  return msg || "Algo deu errado. Tente de novo.";
}
