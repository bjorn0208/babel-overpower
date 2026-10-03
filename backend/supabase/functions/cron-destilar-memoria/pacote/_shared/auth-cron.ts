import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Autorização padrão para funções de cron (auditoria 2026-08-31).
 *
 * Antes, ~15 crons de LLM/memória não tinham guard nenhum e dependiam só do
 * `verify_jwt` do deploy — abrindo denial-of-wallet (qualquer um com a anon
 * key pública queimava crédito de LLM). Este helper centraliza o mesmo tríplice
 * guard que processar-disparos-rifa / cron-status-rifa já usavam:
 *   1) Bearer == SERVICE_ROLE_KEY  (pg_cron via pg_net)
 *   2) Bearer == segredo do vault  (ler_segredo_cron)
 *   3) (opcional) JWT de tenant válido → modo teste (retorna tenantTeste)
 *
 * Uso mínimo:
 *   const { ok } = await autorizarCron(req);
 *   if (!ok) return new Response(JSON.stringify({ ok:false, erro:"nao_autorizado" }),
 *     { status:401, headers:{ "Content-Type":"application/json" } });
 */
export async function autorizarCron(
  req: Request,
  permitirTeste = false,
): Promise<{ ok: boolean; tenantTeste?: string | null }> {
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, chave);

  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!bearer) return { ok: false };
  if (bearer === chave) return { ok: true };

  const { data: segredo } = await sb.rpc("ler_segredo_cron");
  if (typeof segredo === "string" && segredo.length > 0 && bearer === segredo) {
    return { ok: true };
  }

  if (permitirTeste) {
    const { data: auth } = await sb.auth.getUser(bearer);
    if (auth?.user?.id) return { ok: true, tenantTeste: auth.user.id };
  }

  return { ok: false };
}
