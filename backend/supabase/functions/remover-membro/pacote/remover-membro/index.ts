import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
/**
 * Remove um membro da equipe (2026-09-24, decisão de Adrian Alves).
 * Antes, "Remover" na Equipe só marcava o perfil (soft delete) direto do navegador: o login continuava
 * entrando e o acesso ao app Gestão (gestao_acessos) continuava valendo. Agora, pelo servidor:
 *   1. BLOQUEIA o login (ban) — reativar pela Equipe (convidar-membro) desbloqueia (ban_duration "none");
 *   2. revoga o acesso ao app Gestão (gestao_acessos.deleted_at), se houver;
 *   3. marca o perfil como removido (deleted_at, is_active = false, account_status = 'inativo').
 * Ordem (2026-09-25, aviso A-RM1 do Serjão): o perfil é marcado por ÚLTIMO. Se o bloqueio ou a Gestão falharem, o
 * membro continua na lista e o dono pode tentar de novo (cada passo pode ser repetido sem efeito colateral). Antes,
 * o perfil era marcado primeiro: se o bloqueio falhasse, o membro sumia da lista com o login ainda liberado.
 * Nada é apagado: histórico, conversas e o próprio login continuam no banco.
 *
 * Auth: usa o JWT do chamador; só o dono do tenant remove membro da PRÓPRIA equipe (parent_user_id = chamador).
 */ Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: corsHeaders
  });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({
      error: "no_auth"
    }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({
      error: "invalid_token"
    }, 401);
    const chamador = userData.user;
    const body = await req.json().catch(()=>({}));
    const id = String(body.id ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({
      error: "membro_invalido"
    }, 400);
    if (id === chamador.id) return json({
      error: "nao_remove_a_si_mesmo"
    }, 400);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    // Só membro da PRÓPRIA equipe (mesma resposta para "não existe" e "é de outra equipe": nada vaza).
    const { data: membro, error: buscaErr } = await admin.from("profiles")
      .select("id, parent_user_id, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (buscaErr) return json({
      error: "erro_consulta"
    }, 500);
    if (!membro || membro.parent_user_id !== chamador.id) return json({
      error: "membro_nao_encontrado"
    }, 404);
    // 1. login bloqueado (~100 anos). Reativar pela Equipe desbloqueia.
    const { error: banErr } = await admin.auth.admin.updateUserById(id, {
      ban_duration: "876000h"
    });
    if (banErr) return json({
      error: "erro_bloquear_login"
    }, 400);
    // 2. acesso ao app Gestão revogado (só existe no tenant que tem a Gestão; nos outros não acha nada)
    const { error: gestaoErr } = await admin.from("gestao_acessos")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);
    if (gestaoErr) return json({
      error: "erro_revogar_gestao"
    }, 400);
    // 3. perfil removido, por último (parent_user_id e system_role não mudam: o gatilho prevenir_mudanca_campo_critico barraria)
    const { error: perfilErr } = await admin.from("profiles").update({
      deleted_at: membro.deleted_at ?? new Date().toISOString(),
      is_active: false,
      account_status: "inativo"
    }).eq("id", id).eq("parent_user_id", chamador.id);
    if (perfilErr) return json({
      error: "erro_remover_perfil"
    }, 400);
    return json({
      id,
      removido: true
    }, 200);
  } catch (_e) {
    return json({
      error: "erro_interno"
    }, 500);
  }
});
function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
