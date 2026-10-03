import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

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

function normalizarPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11 || d.length === 10) return "55" + d;
  return d;
}

function shortToken(token: string): string {
  return token.replace(/-/g, "").slice(0, 8);
}

async function getOrCreateSession(
  supabase: SupabaseClient,
  userId: string,
  sessionToken: string | null,
  ip: string,
  userAgent: string,
): Promise<{ id: string; token: string; lead_id: string | null; conversation_id: string | null; visitor_phone: string | null }> {
  if (sessionToken) {
    const { data } = await supabase
      .from("sessoes_chat_publico")
      .select("id, chave_sessao, lead_id, conversation_id, visitor_phone, user_id")
      .eq("chave_sessao", sessionToken)
      .maybeSingle();
    if (data && data.user_id === userId) {
      await supabase
        .from("sessoes_chat_publico")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", data.id);
      return {
        id: data.id,
        token: data.chave_sessao,
        lead_id: data.lead_id,
        conversation_id: data.conversation_id,
        visitor_phone: data.visitor_phone,
      };
    }
  }
  const { data: nova, error } = await supabase
    .from("sessoes_chat_publico")
    .insert({ user_id: userId, ip_hash: ip, user_agent: userAgent })
    .select("id, chave_sessao")
    .single();
  if (error || !nova) throw new Error("falha ao criar sessão");
  return { id: nova.id, token: nova.chave_sessao, lead_id: null, conversation_id: null, visitor_phone: null };
}

function extrairPhoneDosDados(dados: Record<string, unknown> | undefined): string | null {
  if (!dados) return null;
  const candidatos = ["telefone", "phone", "celular", "whatsapp"];
  for (const key of candidatos) {
    const v = dados[key];
    if (typeof v === "string" && v.replace(/\D/g, "").length >= 10) return v;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, cors, 405);

  try {
    const body = await req.json();
    const { slug, chave_sessao: bodySessionToken, message, visitor_name, visitor_phone, visitor_email } = body;

    if (!slug || typeof slug !== "string") return jsonResponse({ error: "slug obrigatório" }, cors, 400);
    if (!message || typeof message !== "string") return jsonResponse({ error: "message obrigatória" }, cors, 400);
    if (message.length > 2000) return jsonResponse({ error: "mensagem longa demais" }, cors, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: prof } = await supabase
      .from("perfil_publico")
      .select("user_id, is_active, agent_enabled")
      .eq("slug", slug)
      .maybeSingle();
    if (!prof || !prof.is_active) return jsonResponse({ error: "perfil não encontrado" }, cors, 404);
    if (!prof.agent_enabled) return jsonResponse({ error: "agente desativado neste perfil" }, cors, 403);

    const { data: agentRow } = await supabase
      .from("agentes_usuario")
      .select("id")
      .eq("user_id", prof.user_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!agentRow?.id) return jsonResponse({ error: "agente não configurado" }, cors, 503);
    const agentId = agentRow.id;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ua = (req.headers.get("user-agent") || "").slice(0, 255);

    const session = await getOrCreateSession(supabase, prof.user_id, bodySessionToken || null, ip, ua);

    // 2026-09-17: o parâmetro era `p_action`, nome que NÃO existe na função
    // (p_identifier, p_endpoint, p_max_requests, p_window_seconds) → PostgREST
    // devolvia 404 PGRST202, o erro era descartado e o teto NUNCA reprovava.
    const { data: rl, error: errRl } = await supabase.rpc("verificar_limite_taxa", {
      p_identifier: `pubchat:${session.token}`, p_endpoint: "public_chat", p_max_requests: 20, p_window_seconds: 60,
    });
    if (errRl) console.error(`[chat-publico] rate limit falhou: ${errRl.message}`);
    if (rl === false) return jsonResponse({ error: "rate limit" }, cors, 429);

    // Limite por IP além do de sessão (auditoria 2026-08-31): o limite por
    // session.token sozinho era burlável — omitindo a chave, o cliente ganha
    // sessão nova a cada request e nunca batia no teto (denial-of-wallet no
    // motor de LLM). O teto por IP fecha esse bypass.
    const { data: rlIp, error: errRlIp } = await supabase.rpc("verificar_limite_taxa", {
      p_identifier: `pubchat_ip:${ip}`, p_endpoint: "public_chat", p_max_requests: 40, p_window_seconds: 60,
    });
    if (errRlIp) console.error(`[chat-publico] rate limit por IP falhou: ${errRlIp.message}`);
    if (rlIp === false) return jsonResponse({ error: "rate limit" }, cors, 429);

    const visitorPhoneNorm = visitor_phone ? normalizarPhone(visitor_phone) : null;
    const phoneAtual = session.visitor_phone || visitorPhoneNorm || `pub:${shortToken(session.token)}`;

    if (visitorPhoneNorm && visitorPhoneNorm !== session.visitor_phone) {
      const patch: Record<string, unknown> = { visitor_phone: visitorPhoneNorm };
      if (visitor_name) patch.visitor_name = visitor_name;
      if (visitor_email) patch.visitor_email = visitor_email;
      await supabase.from("sessoes_chat_publico").update(patch).eq("id", session.id);

      if (session.conversation_id) {
        await supabase.from("conversas").update({ phone: visitorPhoneNorm }).eq("id", session.conversation_id);
      }
      if (session.lead_id) {
        const leadPatch: Record<string, unknown> = { phone: visitorPhoneNorm };
        if (visitor_name) leadPatch.name = visitor_name;
        if (visitor_email) leadPatch.email = visitor_email;
        await supabase.from("leads").update(leadPatch).eq("id", session.lead_id);
      }
    }

    const invokeBody: Record<string, unknown> = {
      message,
      agente_id: agentId,
      phone: phoneAtual,
      channel: "perfil_publico",
    };
    if (session.conversation_id) invokeBody.conversation_id = session.conversation_id;

    // Motor único vivo (o legado `chat` foi aposentado em 2026-05-12).
    const { data: chatResp, error: chatErr } = await supabase.functions.invoke("ragentic-processar-inline", { body: invokeBody });
    if (chatErr) {
      console.error("[public-chat] invoke chat error", chatErr);
      return jsonResponse({ error: "falha no motor" }, cors, 502);
    }
    if (chatResp?.error) return jsonResponse({ error: chatResp.error }, cors, 400);

    const convId = chatResp?.conversation_id as string | undefined;
    const leadCard = chatResp?.lead_card as { dados_capturados?: Record<string, unknown> } | undefined;

    if (convId && !session.conversation_id) {
      const { data: conv } = await supabase.from("conversas").select("lead_id").eq("id", convId).maybeSingle();
      await supabase.from("sessoes_chat_publico").update({
        conversation_id: convId,
        lead_id: conv?.lead_id || null,
      }).eq("id", session.id);
      session.conversation_id = convId;
      session.lead_id = conv?.lead_id || null;
    }

    const phoneCapturado = extrairPhoneDosDados(leadCard?.dados_capturados);
    let leadCaptured = false;
    if (phoneCapturado && !session.visitor_phone) {
      const phoneNorm = normalizarPhone(phoneCapturado);
      await supabase.from("sessoes_chat_publico").update({ visitor_phone: phoneNorm }).eq("id", session.id);
      if (session.conversation_id) {
        await supabase.from("conversas").update({ phone: phoneNorm }).eq("id", session.conversation_id);
      }
      if (session.lead_id) {
        await supabase.from("leads").update({
          phone: phoneNorm,
          origem_lead: "perfil_publico",
          canal_externo: "perfil_publico",
        }).eq("id", session.lead_id);
      }
      leadCaptured = true;
      await supabase.from("eventos_perfil_publico").insert({
        user_id: prof.user_id,
        session_id: session.id,
        event_type: "lead_created",
      });
    }

    await supabase.from("eventos_perfil_publico").insert({
      user_id: prof.user_id,
      session_id: session.id,
      event_type: "chat_message",
    });

    return jsonResponse({
      chave_sessao: session.token,
      reply: chatResp.reply,
      mensagens: chatResp.mensagens || [],
      conversation_id: session.conversation_id,
      lead_captured: leadCaptured,
    }, cors, 200);
  } catch (e) {
    console.error("[public-chat]", e);
    return jsonResponse({ error: (e as Error).message || "erro interno" }, cors, 500);
  }
});
