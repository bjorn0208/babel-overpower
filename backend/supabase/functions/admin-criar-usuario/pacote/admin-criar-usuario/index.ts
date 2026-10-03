import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Cria um usuário novo pelo painel do admin da plataforma.
// Autorização: SOMENTE platform_admin (auditoria 2026-08-31 — antes qualquer
// autenticado criava conta e atribuía role_id arbitrário → escalonamento).
// Registra o convite em `invitations` (tenant do novo usuário = ele mesmo,
// pois é uma conta top-level; membros de equipe entram por convidar-membro).
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonRes = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "Nao autorizado" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return jsonRes({ error: "Token invalido" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Guard de admin: lê system_role via service role (sem RLS), por id do caller.
    const { data: callerProfile, error: callerErr } = await adminClient
      .from("profiles")
      .select("system_role")
      .eq("id", caller.id)
      .single();
    if (callerErr || !callerProfile) {
      return jsonRes({ error: "Perfil do chamador nao encontrado" }, 403);
    }
    if (callerProfile.system_role !== "platform_admin") {
      return jsonRes({ error: "Apenas o admin da plataforma pode criar usuarios" }, 403);
    }

    const { email, password, full_name, role_id } = await req.json();
    if (!email || !password || !full_name || !role_id) {
      return jsonRes(
        { error: "email, password, full_name e role_id sao obrigatorios" },
        400,
      );
    }
    if (typeof password !== "string" || password.length < 6) {
      return jsonRes({ error: "A senha deve ter no minimo 6 caracteres" }, 400);
    }

    // Cria o usuário primeiro (o trigger handle_new_user materializa o profile).
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr || !newUser?.user) {
      return jsonRes({ error: createErr?.message ?? "Falha ao criar usuario" }, 400);
    }

    // Registra o convite/atribuição de papel. Conta top-level: tenant = ele mesmo.
    const { error: invErr } = await adminClient
      .from("convites")
      .insert({
        tenant_id: newUser.user.id,
        email,
        role_id,
        invited_by: caller.id,
        status: "aceito",
      });
    if (invErr) {
      // Rollback do auth user se não conseguimos registrar o convite.
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return jsonRes({ error: invErr.message }, 400);
    }

    console.log(`[admin-criar-usuario] admin ${caller.id} criou usuario ${newUser.user.id} (${email})`);
    return jsonRes({ success: true, user_id: newUser.user.id, email }, 201);
  } catch (err) {
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
