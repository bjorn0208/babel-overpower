import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VALID_EVENTS = new Set([
  "page_view", "cta_click", "chat_started", "chat_message",
  "lead_created", "whatsapp_handoff", "testimonial_submitted",
]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, cors, 405);

  try {
    const { slug, event_type, session_id, metadata } = await req.json();
    if (!slug || !event_type) return jsonResponse({ error: "slug e event_type obrigatórios" }, cors, 400);
    if (!VALID_EVENTS.has(event_type)) return jsonResponse({ error: "event_type inválido" }, cors, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limit por IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    // 2026-09-17: era `p_action`, parâmetro inexistente na função → 404 PGRST202
    // com erro descartado, ou seja, sem teto nenhum. Ver chat-publico.
    const { data: rl, error: errRl } = await supabase.rpc("verificar_limite_taxa", {
      p_identifier: `evt:${ip}`, p_endpoint: "public_event", p_max_requests: 60, p_window_seconds: 60,
    });
    if (errRl) console.error(`[evento-publico] rate limit falhou: ${errRl.message}`);
    if (rl === false) return jsonResponse({ error: "rate limit" }, cors, 429);

    const { data: prof } = await supabase
      .from("perfil_publico")
      .select("user_id, is_active")
      .eq("slug", slug)
      .single();

    if (!prof || !prof.is_active) return jsonResponse({ error: "perfil não encontrado" }, cors, 404);

    const { error } = await supabase.from("eventos_perfil_publico").insert({
      user_id: prof.user_id,
      session_id: session_id || null,
      event_type,
      metadata: metadata ?? null,
    });
    if (error) {
      console.error("[public-event] insert", error);
      return jsonResponse({ error: "falha ao registrar evento" }, cors, 500);
    }

    return jsonResponse({ ok: true }, cors, 200);
  } catch (e) {
    console.error("[public-event]", e);
    return jsonResponse({ error: "erro interno" }, cors, 500);
  }
});
