/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

/**
 * Ponte do app Rifas pro CANAL INTERNO (Mentor/Admin).
 *
 * Por que existe: o canal interno não usa o mesmo cano do motor externo. Lá as
 * tools vêm de `cargo_ferramentas` (`ragentic-processar-inline`); aqui vêm de
 * arrays fixos em `tools-mentor.ts` / `tools-admin.ts`, montados por
 * `canal-interno.ts`. Sem esta ponte, semear as tools de rifa no banco não faria
 * NADA pro dono conversando com o Mentor — que é justamente onde o poder de dono
 * tem que estar (decisão Theus 2026-09-06).
 *
 * O schema NÃO é duplicado aqui: vem de `ferramentas_dinamicas`, a mesma linha que
 * o motor externo lê. Um lugar só pra descrever a tool; se mudar a descrição no
 * banco, os dois canais mudam juntos.
 *
 * Catraca: só entra se `rifa_app_instalado(tenant)`. Tenant sem o app não paga o custo
 * dessas tools no prompt.
 *
 * É `rifa_app_instalado` e NÃO `rifa_pode_vender` (Theus 2026-09-07): "o Bricio é o agente
 * dentro da Rifa". `agente_pode_vender` é a catraca do agente EXTERNO vendendo pro lead no
 * WhatsApp — pendurar o canal do DONO nela cegava o dono do próprio painel quando a venda
 * automática estava desligada. O caminho externo (`tools-rifas.ts` → `catracaLiberada`,
 * `apps-agente.ts`) continua exigindo o toggle, intocado.
 */

import { HANDLERS_RIFA_VENDA } from "./tools-rifas.ts";
import { HANDLERS_RIFA_ADMIN } from "./tools-rifas-admin.ts";

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export interface ToolSchemaRifa {
  type: "function";
  function: {
    name: string;
    description: string;
    // deno-lint-ignore no-explicit-any
    parameters: any;
  };
}

const HANDLERS = { ...HANDLERS_RIFA_VENDA, ...HANDLERS_RIFA_ADMIN };

/** Nomes das tools de rifa que o canal interno pode despachar. */
export const NOMES_TOOLS_RIFA = Object.keys(HANDLERS);

/**
 * Monta os schemas das tools de rifa pro canal interno (Bricio + Mentor do dono).
 * Devolve [] quando o tenant não tem o app instalado — assim o prompt do Mentor de
 * quem não usa rifa continua do mesmo tamanho de antes.
 */
export async function carregarToolsRifaMentor(
  admin: AnyClient,
  tenantId: string,
): Promise<ToolSchemaRifa[]> {
  try {
    const { data: temApp } = await admin.rpc("rifa_app_instalado", { p_tenant_id: tenantId });
    if (temApp !== true) return [];

    const { data } = await admin
      .from("ferramentas_dinamicas")
      .select("nome_tool, descricao, schema_zod")
      .in("nome_tool", NOMES_TOOLS_RIFA)
      .eq("escopo", "global")
      .eq("ativo", true);

    // deno-lint-ignore no-explicit-any
    return ((data ?? []) as any[]).map((f) => ({
      type: "function" as const,
      function: {
        name: f.nome_tool,
        description: String(f.descricao ?? ""),
        // Schema mal fechado derruba o request INTEIRO na OpenRouter (incidente
        // v207, 2026-08-02) — na dúvida, objeto vazio bem formado.
        parameters: f.schema_zod ?? { type: "object", properties: {} },
      },
    }));
  } catch {
    return [];
  }
}

/**
 * Despacha uma tool de rifa e devolve texto pro LLM — contrato do canal interno
 * (lá toda tool retorna string, não objeto).
 */
export async function executarToolRifa(
  nome: string,
  args: Record<string, unknown>,
  ctx: { tenant_id: string; supabase_admin: AnyClient; conversa_id?: string | null },
): Promise<string> {
  const handler = HANDLERS[nome];
  if (!handler) return `Ferramenta de rifa desconhecida: ${nome}`;

  try {
    const r = await handler(ctx.supabase_admin, {
      tenant_id: ctx.tenant_id,
      conversa_id: ctx.conversa_id ?? "",
      telefone: null,
      lead_id: null,
    }, args);
    return r.ok ? (r.mensagem ?? "Feito.") : `Não deu: ${r.mensagem ?? "erro desconhecido"}`;
  } catch (e) {
    return `Falha ao executar ${nome}: ${(e as Error).message}`;
  }
}
