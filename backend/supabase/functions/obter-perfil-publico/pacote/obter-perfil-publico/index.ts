import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    let slug: string | null = null;
    if (req.method === "GET") {
      const url = new URL(req.url);
      slug = url.searchParams.get("slug");
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      slug = body?.slug || null;
    }

    if (!slug) return jsonResponse({ error: "slug obrigatório" }, cors, 400);
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) return jsonResponse({ error: "slug inválido" }, cors, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("publico_obter_perfil", { p_slug: slug });
    if (error) {
      console.error("[public-profile-get] RPC error", error);
      return jsonResponse({ error: "falha ao carregar perfil" }, cors, 500);
    }
    if (!data) return jsonResponse({ error: "perfil não encontrado" }, cors, 404);

    return jsonResponse(data, cors, 200);
  } catch (e) {
    console.error("[public-profile-get]", e);
    return jsonResponse({ error: "erro interno" }, cors, 500);
  }
});
