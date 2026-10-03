/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsOk, jsonRes } from "../_shared/cors.ts";

// Redefine a senha de um tenant pelo painel do admin.
// Autorização: somente o admin da plataforma (system_role = 'platform_admin').
// A senha vive só em auth.users como hash — aqui nunca é lida nem logada.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsOk();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "Não autorizado" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return jsonRes({ error: "Token inválido" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Lê system_role via service role (sem RLS), por id do chamador.
    const { data: callerProfile, error: callerErr } = await adminClient
      .from("profiles")
      .select("system_role")
      .eq("id", caller.id)
      .single();
    if (callerErr || !callerProfile) {
      return jsonRes({ error: "Perfil do chamador não encontrado" }, 403);
    }
    if (callerProfile.system_role !== "platform_admin") {
      return jsonRes({ error: "Apenas o admin da plataforma pode redefinir senhas" }, 403);
    }

    const { user_id, nova_senha } = await req.json();
    if (!user_id || !nova_senha) {
      return jsonRes({ error: "user_id e nova_senha são obrigatórios" }, 400);
    }
    if (typeof nova_senha !== "string" || nova_senha.length < 6) {
      return jsonRes({ error: "A senha deve ter no mínimo 6 caracteres" }, 400);
    }

    // Alvo precisa existir e não estar excluído (soft delete).
    const { data: alvo } = await adminClient
      .from("profiles")
      .select("id, deleted_at")
      .eq("id", user_id)
      .single();
    if (!alvo || alvo.deleted_at) {
      return jsonRes({ error: "Usuário não encontrado" }, 404);
    }

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      user_id,
      { password: nova_senha },
    );
    if (updateErr) return jsonRes({ error: updateErr.message }, 400);

    console.log(`[admin-redefinir-senha] admin ${caller.id} redefiniu senha do usuário ${user_id}`);
    return jsonRes({ success: true });
  } catch (err) {
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
