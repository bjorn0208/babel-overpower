/**
 * CORS helpers compartilhados pra edges públicas.
 *
 * Padrão observado em 29 edges (auditoria 2026-05-07): todos usam
 * `Access-Control-Allow-Origin: *` + headers de auth/apikey + métodos
 * POST + OPTIONS. Centralizado aqui pra evitar drift.
 *
 * Uso:
 * ```ts
 * import { corsHeaders, corsOk, jsonRes } de "compartilhado/cors.ts" (exemplo);
 *
 * Deno.serve(async (req) => {
 *   if (req.method === "OPTIONS") return corsOk();
 *   try {
 *     // ...
 *     return jsonRes({ ok: true });
 *   } catch (err) {
 *     return jsonRes({ error: String(err) }, 500);
 *   }
 * });
 * ```
 */

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Resposta padrão pra preflight OPTIONS — nada no corpo, só headers CORS.
 */
export function corsOk(): Response {
  return new Response(null, { headers: corsHeaders });
}

/**
 * JSON response com CORS embutido.
 */
export function jsonRes(
  body: Record<string, unknown> | unknown[],
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

