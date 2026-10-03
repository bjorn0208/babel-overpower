/**
 * Ações de banco do hub Conhecimento (criar/editar/excluir o bloco próprio +
 * ligar/desligar bloco de nicho via override por tenant).
 *
 * Tenancy: gavetas usam `tenant_id`, exceto Conhecimento (`agente_id`).
 * Soft-delete onde a tabela tem `deleted_at`; senão delete real (é bloco do
 * próprio tenant). Override só existe pra bloco de nicho (regra "global fixo").
 */

import { supabase } from "@/integrations/supabase/client";
import type { Gaveta } from "./gavetas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type CtxHub = { tenantId: string; agenteId: string | null };
export type ValoresBloco = Record<string, string>;

function montarConteudo(g: Gaveta, valores: ValoresBloco): Record<string, unknown> {
  const linha: Record<string, unknown> = {};
  for (const campo of g.campos) {
    const valor = (valores[campo.chave] ?? "").trim();
    if (g.corpoJson && campo.chave === g.campoCorpo) {
      linha[campo.chave] = { instrucao: valor };
    } else {
      linha[campo.chave] = valor;
    }
  }
  return linha;
}

export async function criarBloco(g: Gaveta, ctx: CtxHub, valores: ValoresBloco): Promise<void> {
  const linha: Record<string, unknown> = {
    ...montarConteudo(g, valores),
    ...(g.fixosInsert ?? {}),
    escopo: "tenant",
    ativo: true,
  };
  if (g.tenancy === "tenant_id") linha.tenant_id = ctx.tenantId;
  else linha.agente_id = ctx.agenteId;
  const { error } = await sb.from(g.tabela).insert(linha);
  if (error) throw error;
}

export async function editarBloco(g: Gaveta, id: string, valores: ValoresBloco): Promise<void> {
  const { error } = await sb.from(g.tabela).update(montarConteudo(g, valores)).eq("id", id);
  if (error) throw error;
}

/**
 * Liga/desliga um bloco DO PRÓPRIO TENANT. É a única forma de o dono tirar um bloco de
 * circulação — **o tenant não apaga conhecimento**, só marca e desmarca. Apagar é do admin.
 *
 * Por quê: a exclusão pelo tenant era uma armadilha. `blocos_conhecimento` não tem policy
 * de DELETE, então o `.delete()` casava com 0 linhas, o PostgREST devolvia 204 e a UI
 * comemorava sucesso sem ter apagado nada. Foi o que causou o incidente do tenant Otmar em
 * 2026-09-03: tentaram excluir 3x, nada acontecia, e a saída foi desligar os 10 blocos —
 * parecendo que o conhecimento tinha evaporado.
 *
 * Desligar é reversível e honesto: o bloco continua na lista, apagado, com o botão de
 * religar. `ativo=false` é o que tira do RAG — as 20 RPCs `busca_hibrida_*` filtram por
 * `ativo`, nunca por `deleted_at`.
 */
export async function alternarAtivoBloco(g: Gaveta, id: string, ativo: boolean): Promise<void> {
  // Δ 2026-09-08 — ligar um bloco também o APROVA. Bloco vindo do loop do Mentor
  // nasce `ativo=false, aprovado=false` (caixa de pré-aprovados). Quando o dono liga
  // o toggle, ele está justamente aprovando: some da caixa e entra no conhecimento
  // vivo. Só a gaveta blocos_conhecimento tem a coluna `aprovado`.
  const patch: Record<string, unknown> = { ativo };
  if (ativo && g.tabela === "blocos_conhecimento") patch.aprovado = true;
  const { error } = await sb.from(g.tabela).update(patch).eq("id", id);
  if (error) throw error;
}

/** desligar (true) ou religar (false) um bloco de NICHO herdado, só pra este tenant */
export async function alternarNicho(
  g: Gaveta,
  blocoId: string,
  tenantId: string,
  desligar: boolean,
): Promise<void> {
  if (!g.tabelaOverride) throw new Error("Gaveta sem override de nicho");
  if (desligar) {
    const { error } = await sb.from(g.tabelaOverride).upsert(
      { bloco_id: blocoId, tenant_id: tenantId, ativo: false, motivo: "Desativado pelo tenant" },
      { onConflict: "bloco_id,tenant_id" },
    );
    if (error) throw error;
  } else {
    const { error } = await sb
      .from(g.tabelaOverride)
      .delete()
      .eq("bloco_id", blocoId)
      .eq("tenant_id", tenantId);
    if (error) throw error;
  }
}
