import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = criarClienteAdmin();

    // Auth: verificar identidade do caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { message_id } = await req.json();
    if (!message_id) {
      return new Response(JSON.stringify({ error: "message_id obrigatorio" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: msg } = await supabase.from("mensagens")
      .select("id, conversation_id, zapi_message_id, role, sender_id")
      .eq("id", message_id).single();
    if (!msg) {
      return new Response(JSON.stringify({ error: "mensagem nao encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conv } = await supabase.from("conversas")
      .select("phone, tenant_id, channel").eq("id", msg.conversation_id).single();

    // Verificar que caller pertence ao tenant da conversa
    if (conv) {
      const { data: callerProfile } = await supabase.from("profiles").select("parent_user_id").eq("id", user.id).single();
      const callerTenant = callerProfile?.parent_user_id || user.id;
      if (callerTenant !== conv.tenant_id) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    let zapiDeleted = false;

    if (conv?.channel === "whatsapp" && msg.zapi_message_id) {
      const { data: ch } = await supabase.from("canais")
        .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url")
        .eq("user_id", conv.tenant_id).eq("type", "whatsapp").eq("is_active", true).maybeSingle();

      if (ch?.zapi_instance_id && ch?.zapi_token) {
        const base = `${ch.zapi_api_url || "https://api.z-api.io"}/instances/${ch.zapi_instance_id}/token/${ch.zapi_token}`;
        try {
          const isOwner = msg.role !== "user";
          const res = await fetch(
            `${base}/messages?messageId=${msg.zapi_message_id}&phone=${conv.phone}&owner=${isOwner}`,
            { method: "DELETE", headers: { "Content-Type": "application/json", "Client-Token": ch.zapi_security_token || "" } },
          );
          zapiDeleted = res.status === 200 || res.status === 204;
        } catch { /* Z-API unavailable */ }
      }
    }

    await supabase.from("mensagens").update({ deleted_at: new Date().toISOString() }).eq("id", message_id);

    return new Response(JSON.stringify({ ok: true, zapi_deleted: zapiDeleted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  }
});
