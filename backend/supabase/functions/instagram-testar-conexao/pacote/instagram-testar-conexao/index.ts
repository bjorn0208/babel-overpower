import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

// instagram-testar-conexao — valida as credenciais do canal Instagram de um tenant
// (fase 1 do canal Instagram: admin cola token manual no app Tenants e testa aqui).
// Chama GET /me da Graph API com o ig_token salvo; token nunca sai pro browser.

function jsonResp(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = criarClienteAdmin();

    // Auth: identidade do caller (admin da plataforma ou o próprio tenant)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ ok: false, erro: "unauthorized" }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return jsonResp({ ok: false, erro: "unauthorized" }, 401);

    const { tenant_id } = await req.json() as { tenant_id?: string };
    if (!tenant_id) return jsonResp({ ok: false, erro: "tenant_id obrigatório" }, 400);

    const { data: callerProfile } = await supabase
      .from("profiles").select("parent_user_id, system_role").eq("id", user.id).single();
    const isAdmin = callerProfile?.system_role === "platform_admin";
    const callerTenant = callerProfile?.parent_user_id || user.id;
    if (!isAdmin && callerTenant !== tenant_id) {
      return jsonResp({ ok: false, erro: "forbidden" }, 403);
    }

    const { data: canal } = await supabase
      .from("canais")
      .select("ig_token, ig_username")
      .eq("user_id", tenant_id)
      .eq("type", "instagram")
      .maybeSingle();

    if (!canal?.ig_token) {
      return jsonResp({ ok: false, erro: "canal Instagram sem token — salve as credenciais antes de testar" });
    }

    const res = await fetch("https://graph.instagram.com/v24.0/me?fields=user_id,username", {
      headers: { Authorization: `Bearer ${canal.ig_token}` },
    });
    const texto = await res.text();
    let dados: Record<string, unknown> = {};
    try { dados = JSON.parse(texto); } catch { /* corpo não-JSON */ }

    if (!res.ok || dados.error) {
      console.error(`[instagram-testar-conexao] Graph API status=${res.status} corpo=${texto.slice(0, 300)}`);
      return jsonResp({ ok: false, erro: "token recusado pelo Instagram (expirado ou inválido)" });
    }

    const username = (dados.username as string) || canal.ig_username || null;
    return jsonResp({ ok: true, username });
  } catch (e) {
    console.error(`[instagram-testar-conexao] erro: ${(e as Error).message}`);
    return jsonResp({ ok: false, erro: "falha interna ao testar conexão" }, 500);
  }
});
