/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

/**
 * Tools do cargo Admin (canal interno, platform_admin).
 *
 * Quando o cargo ativo no canal interno é "Admin" (`cargos.tipologia='admin'
 * AND escopo='global'`) e NÃO é a Curadoria, o `canal-interno.ts` carrega
 * TOOLS_ADMIN em vez de cair no fallback de TOOLS_MENTOR (que era o bug:
 * o Admin herdava as ferramentas do dono-de-tenant).
 *
 * O Admin é o agente do dono da PLATAFORMA (Theus) — invisível ao tenant comum
 * (RLS F1). Diferença pro cargo Curadoria: Curadoria governa o motor RAG
 * (blocos, avisos, candidatos); Admin observa a plataforma como um todo
 * (saúde, volume, cross-tenant).
 *
 * Padrão simétrico a `tools-mentor.ts` / `tools-curadoria.ts`:
 *   - `ToolSchema` (OpenAI/OpenRouter function calling)
 *   - `TOOLS_ADMIN: ToolSchema[]`
 *   - `executarTool(nome, args, ctx)` dispatcha pro handler
 *   - cada handler retorna `string` (conteúdo pro LLM injetar no contexto)
 *
 * Ferramentas de AÇÃO SEMÂNTICA (técnica 4) NÃO vivem aqui: são declaradas no
 * banco (`ferramentas_dinamicas.endpoint_url='rag://<busca_hibrida_X>'`),
 * vinculadas ao cargo Admin, e despachadas por `_shared/tools-rag.ts`. Este
 * arquivo guarda só os handlers determinísticos próprios do Admin.
 *
 * Cuidados:
 *   - Só `platform_admin` chega aqui (resolução de cargo no canal-interno).
 *   - `ctx.supabase_admin` é service_role — não confiar args sem validar.
 */

import {
  handlerAtualizarDados,
  handlerConsultarDados,
  handlerExcluirDados,
  SCHEMA_ATUALIZAR_DADOS,
  SCHEMA_CONSULTAR_DADOS,
  SCHEMA_EXCLUIR_DADOS,
} from "./tools-consulta-dados.ts";
import {
  handlerConsultarInstagram,
  handlerPesquisarGoogle,
  SCHEMA_CONSULTAR_INSTAGRAM,
  SCHEMA_PESQUISAR_GOOGLE,
} from "./tools-externas.ts";
import { handlerGerarDocumentoPdf, SCHEMA_GERAR_DOCUMENTO_PDF } from "./tools-documento.ts";

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export interface CtxAdmin {
  user_id: string;
  supabase_admin: AnyClient;
  /** Tenant impersonado no momento (null = visão global da plataforma). */
  tenant_impersonado_id?: string | null;
  /** Conversa do canal interno — gate de 2 turnos da tool excluir_dados. */
  conversa_id?: string | null;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// ============================================================
// SCHEMAS (function calling)
// ============================================================

export const TOOLS_ADMIN: ToolSchema[] = [
  SCHEMA_CONSULTAR_DADOS,
  SCHEMA_ATUALIZAR_DADOS,
  SCHEMA_EXCLUIR_DADOS,
  SCHEMA_PESQUISAR_GOOGLE,
  SCHEMA_CONSULTAR_INSTAGRAM,
  SCHEMA_GERAR_DOCUMENTO_PDF,
  {
    type: "function",
    function: {
      name: "consultar_status_plataforma",
      description:
        "Retorna um panorama geral da plataforma: nº de tenants ativos, conversas e leads totais, e volume de mensagens nas últimas 24h. Use quando o Theus pedir 'como tá a plataforma', 'quantos clientes', 'volume de hoje'.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ============================================================
// EXECUTAR TOOL (dispatcher)
// ============================================================

export async function executarTool(
  nome: string,
  _args: Record<string, unknown>,
  ctx: CtxAdmin,
): Promise<string> {
  switch (nome) {
    case "consultar_dados":
      return handlerConsultarDados(_args, ctx);
    case "atualizar_dados":
      return handlerAtualizarDados(_args, ctx);
    case "excluir_dados":
      return handlerExcluirDados(_args, ctx);
    case "pesquisar_google":
      return handlerPesquisarGoogle(_args);
    case "consultar_instagram":
      return handlerConsultarInstagram(_args);
    case "gerar_documento_pdf":
      return handlerGerarDocumentoPdf(_args, ctx);
    case "consultar_status_plataforma":
      return handlerConsultarStatusPlataforma(ctx);
    default:
      return `Tool desconhecida: "${nome}".`;
  }
}

// ============================================================
// HANDLERS
// ============================================================

async function handlerConsultarStatusPlataforma(ctx: CtxAdmin): Promise<string> {
  const partes: string[] = [];

  // Tenants root (donos de conta) = profiles sem parent_user_id
  const { count: tenants } = await ctx.supabase_admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("parent_user_id", null);

  const { count: conversas } = await ctx.supabase_admin
    .from("conversas")
    .select("id", { count: "exact", head: true });

  const { count: leads } = await ctx.supabase_admin
    .from("leads")
    .select("id", { count: "exact", head: true });

  const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: msgs24h } = await ctx.supabase_admin
    .from("mensagens")
    .select("id", { count: "exact", head: true })
    .gte("created_at", desde24h);

  partes.push("Panorama da plataforma:");
  partes.push(`  Tenants (donos de conta): ${tenants ?? 0}`);
  partes.push(`  Conversas totais: ${conversas ?? 0}`);
  partes.push(`  Leads totais: ${leads ?? 0}`);
  partes.push(`  Mensagens nas últimas 24h: ${msgs24h ?? 0}`);

  return partes.join("\n");
}
