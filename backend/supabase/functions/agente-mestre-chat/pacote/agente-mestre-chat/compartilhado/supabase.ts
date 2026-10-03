/**
 * Helpers compartilhados pra criar clientes Supabase em edges Deno.
 *
 * Padrão observado em 17 edges (auditoria 2026-05-07): cada edge
 * chamava `createClient(SUPABASE_URL, SERVICE_ROLE)` ou
 * `createClient(SUPABASE_URL, ANON_KEY, { headers })` direto.
 * Centralizado aqui pra evitar drift de versão/options + facilitar
 * teste futuro com mock.
 *
 * Uso:
 * ```ts
 * import { criarClienteAdmin, criarClienteUsuario } de "compartilhado/supabase.ts" (exemplo);
 *
 * // service_role (bypassa RLS — só em edges de webhook/cron/admin)
 * const supabase = criarClienteAdmin();
 *
 * // anon + JWT do usuário (respeita RLS — pra edges chamadas pelo frontend)
 * const cliente = criarClienteUsuario(req.headers.get("Authorization") ?? "");
 * ```
 */

import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2";

/**
 * Cliente com `service_role` — bypassa RLS. Usar SOMENTE em edges
 * server-side (webhook, cron, admin) que precisam ler/escrever
 * cross-tenant ou em tabelas restritas.
 *
 * NUNCA expor essa instância pra código que processa input do user
 * sem validar autorização antes.
 */
export function criarClienteAdmin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error(
      "criarClienteAdmin: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente no env",
    );
  }
  return createClient(url, serviceRoleKey);
}

/**
 * Cliente com `anon_key` + JWT do usuário no header — respeita RLS.
 * Usar em edges chamadas pelo frontend que devem operar como o user.
 *
 * @param authHeader Conteúdo do header `Authorization` (ex: `Bearer eyJ...`).
 */
export function criarClienteUsuario(authHeader: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error(
      "criarClienteUsuario: SUPABASE_URL ou SUPABASE_ANON_KEY ausente no env",
    );
  }
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

/**
 * Helper conveniente: lê o `Authorization` do request e cria o cliente user.
 * Retorna `null` se header ausente — chamador decide responder 401.
 */
export function criarClienteUsuarioDoRequest(
  req: Request,
): SupabaseClient | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  return criarClienteUsuario(authHeader);
}

