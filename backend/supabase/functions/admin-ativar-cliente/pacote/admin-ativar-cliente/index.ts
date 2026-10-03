import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// CORS inline (edge auto-suficiente — evita falha de resolução de path no deploy via MCP).
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Cria um novo tenant (login do cliente) pelo painel do admin.
// Modelo atual: o tenant É o profile (sem coluna tenant_id). O trigger
// `processar_novo_usuario` cria o profile + agentes_usuario automaticamente.
// Defaults do profile: is_active=true, account_status='ativo', system_role='user',
// referral_code auto — ou seja, o tenant já consegue logar logo após a criação.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "Nao autorizado" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return jsonRes({ error: "Token invalido" }, 401);

    // Autorizacao: somente o admin da plataforma cria tenant.
    // Le system_role via service role (sem RLS), por id do chamador.
    const { data: callerProfile, error: callerErr } = await adminClient
      .from("profiles")
      .select("system_role")
      .eq("id", caller.id)
      .single();

    if (callerErr || !callerProfile) {
      return jsonRes({ error: "Perfil do chamador nao encontrado" }, 403);
    }
    if (callerProfile.system_role !== "platform_admin") {
      return jsonRes({ error: "Apenas o admin da plataforma pode criar tenants" }, 403);
    }

    const { email, password, full_name, company_name } = await req.json();

    if (!email || !password || !full_name) {
      return jsonRes({ error: "email, password e full_name sao obrigatorios" }, 400);
    }
    if (password.length < 6) {
      return jsonRes({ error: "A senha deve ter no minimo 6 caracteres" }, 400);
    }

    // Email ja cadastrado?
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some(
      // deno-lint-ignore no-explicit-any
      (u: any) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (emailExists) {
      return jsonRes({ error: "Este email ja esta cadastrado" }, 409);
    }

    // Cria o usuario; o trigger cria o profile (tenant) + agentes_usuario.
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        company_name: company_name || full_name,
      },
    });

    if (createErr) {
      return jsonRes({ error: createErr.message }, 400);
    }

    const userId = newUser.user.id;

    // Confirma que o trigger criou o profile.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const { data: newProfile } = await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", userId)
      .single();

    if (!newProfile) {
      return jsonRes({
        error: "Usuario criado mas o profile nao foi gerado pelo trigger",
        user_id: userId,
      }, 500);
    }

    return jsonRes({ success: true, user_id: userId, email }, 201);
  } catch (err) {
    console.error("Erro em admin-ativar-cliente:", err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
