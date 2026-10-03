/**
 * Chat Treino — acesso ao banco (2026-09-18).
 *
 *  - produtos do tenant (seletor de produto em foco → `conversas.produto_foco_id`);
 *  - correções do lápis (`chat_treino_correcoes`, 1 por bolha da agente);
 *  - botão Analisar → edge `chat-treino-analisar` (Mentor de Humanização + conversa padrão).
 *
 * As bolhas da agente que chegam pelo realtime ganham id local; a correção precisa do id real
 * de `mensagens`, então `resolverIdMensagem` acha a linha pelo conteúdo na conversa.
 */

import { supabase } from "@/integrations/supabase/client";
import type { CorrecaoBolha } from "../conversas/ChatAtivo";

// Tabelas novas ainda fora dos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface ProdutoTreino {
  id: string;
  nome: string;
}

export interface AnaliseTreino {
  ok: boolean;
  conversa_padrao_id: string;
  bloco_id: string;
  produto: ProdutoTreino | null;
  substituiu: number;
  correcoes_aplicadas: number;
  humanizacao_original: number;
  humanizacao_final: number;
  comentario_mentor: string;
  pontos_fortes: string[];
  ajustes: string[];
  diretrizes: string[];
  por_mensagem: Array<{ n: number; nota: number; observacao: string }>;
}

export async function resolverTenantId(uid: string): Promise<string> {
  const { data } = await sb.from("profiles").select("parent_user_id").eq("id", uid).maybeSingle();
  return (data?.parent_user_id as string | null) ?? uid;
}

export async function listarProdutos(tenantId: string): Promise<ProdutoTreino[]> {
  const { data, error } = await sb.from("produtos").select("id, nome").eq("user_id", tenantId).order("nome");
  if (error) throw error;
  return (data ?? []) as ProdutoTreino[];
}

export async function definirProdutoFoco(conversaId: string, produtoId: string | null): Promise<void> {
  const { error } = await sb.from("conversas").update({ produto_foco_id: produtoId }).eq("id", conversaId);
  if (error) throw error;
}

export async function lerProdutoFoco(conversaId: string): Promise<string | null> {
  const { data } = await sb.from("conversas").select("produto_foco_id").eq("id", conversaId).maybeSingle();
  return (data?.produto_foco_id as string | null) ?? null;
}

/** id real da bolha em `mensagens` (as do realtime chegam com id local). */
export async function resolverIdMensagem(conversaId: string, idLocal: string, conteudo: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idLocal)) return idLocal;
  const { data } = await sb
    .from("mensagens")
    .select("id")
    .eq("conversation_id", conversaId)
    .in("role", ["assistant", "human"])
    .eq("content", conteudo)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Correções da conversa, por id REAL da mensagem. */
export async function carregarCorrecoes(conversaId: string): Promise<Record<string, CorrecaoBolha & { mensagem_id: string }>> {
  const { data } = await sb
    .from("chat_treino_correcoes")
    .select("mensagem_id, texto_corrigido, sugestao")
    .eq("conversa_id", conversaId);
  const mapa: Record<string, CorrecaoBolha & { mensagem_id: string }> = {};
  for (const c of (data ?? []) as Array<{ mensagem_id: string; texto_corrigido: string | null; sugestao: string | null }>) {
    mapa[c.mensagem_id] = { mensagem_id: c.mensagem_id, texto_corrigido: c.texto_corrigido, sugestao: c.sugestao };
  }
  return mapa;
}

export async function salvarCorrecao(input: {
  tenantId: string;
  conversaId: string;
  mensagemId: string;
  textoOriginal: string;
  textoCorrigido: string;
  sugestao: string;
}): Promise<void> {
  const corrigido = input.textoCorrigido.trim();
  const sugestao = input.sugestao.trim();
  if (!corrigido && !sugestao) {
    await sb.from("chat_treino_correcoes").delete().eq("mensagem_id", input.mensagemId);
    return;
  }
  const { error } = await sb.from("chat_treino_correcoes").upsert(
    {
      tenant_id: input.tenantId,
      conversa_id: input.conversaId,
      mensagem_id: input.mensagemId,
      texto_original: input.textoOriginal,
      texto_corrigido: corrigido && corrigido !== input.textoOriginal.trim() ? corrigido : null,
      sugestao: sugestao || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "mensagem_id" },
  );
  if (error) throw error;
}

export async function analisarConversa(conversaId: string): Promise<AnaliseTreino> {
  const { data, error } = await supabase.functions.invoke<AnaliseTreino & { error?: string }>("chat-treino-analisar", {
    body: { conversa_id: conversaId },
  });
  if (error) {
    // Erro HTTP da edge: tenta ler a mensagem do corpo.
    const ctx = (error as { context?: Response }).context;
    const corpo = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new Error((corpo as { error?: string } | null)?.error ?? error.message);
  }
  if (!data || data.error) throw new Error(data?.error ?? "análise sem resposta");
  return data;
}

/** Faixa de cor/rótulo da nota de humanização. */
export function faixaHumanizacao(nota: number): { rotulo: string; cor: string } {
  if (nota >= 90) return { rotulo: "gente como a gente", cor: "oklch(0.8 0.18 150)" };
  if (nota >= 75) return { rotulo: "bem humana", cor: "oklch(0.8 0.16 120)" };
  if (nota >= 55) return { rotulo: "educada, mas engessada", cor: "oklch(0.82 0.16 85)" };
  return { rotulo: "cheiro de robô", cor: "oklch(0.72 0.19 30)" };
}
