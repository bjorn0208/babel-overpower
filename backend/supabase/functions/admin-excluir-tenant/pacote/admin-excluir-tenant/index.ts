/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsOk, jsonRes } from "../_shared/cors.ts";

// Exclui (ou restaura) um tenant pelo painel do admin.
// Autorização: somente o admin da plataforma (system_role = 'platform_admin').
//
// Exclusão é LÓGICA e reversível — nada de conversa, lead ou mensagem é apagado:
//   • profiles do dono + equipe → deleted_at = now(), is_active = false
//   • auth.users do dono + equipe → banido (login e refresh de sessão recusados)
//   • canais ativos → is_active = false. Webhook, disparos, rifa, lembretes e
//     follow-ups filtram canais.is_active, então o tenant para de enviar/responder.
// O estado anterior (quem estava ativo) vai pra lixeira_exclusoes, e o
// "restaurar" religa exatamente o que foi desligado — nem mais, nem menos.
// Hard delete fica de fora de propósito: auth.users tem FKs NO ACTION
// (mensagens etc.) e apagar histórico de cliente não tem volta.

const COMANDO = "admin-excluir-tenant";
const BAN_PERMANENTE = "876000h"; // ~100 anos

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

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("system_role")
      .eq("id", caller.id)
      .single();
    if (callerProfile?.system_role !== "platform_admin") {
      return jsonRes({ error: "Apenas o admin da plataforma pode excluir tenants" }, 403);
    }

    const { tenant_id, acao = "excluir" } = await req.json();
    if (!tenant_id) return jsonRes({ error: "tenant_id é obrigatório" }, 400);
    if (acao !== "excluir" && acao !== "restaurar") {
      return jsonRes({ error: "acao deve ser 'excluir' ou 'restaurar'" }, 400);
    }
    if (tenant_id === caller.id) {
      return jsonRes({ error: "Você não pode excluir a própria conta" }, 400);
    }

    const { data: alvo } = await admin
      .from("profiles")
      .select("id, email, full_name, system_role, parent_user_id, is_active, deleted_at")
      .eq("id", tenant_id)
      .single();
    if (!alvo) return jsonRes({ error: "Tenant não encontrado" }, 404);
    if (alvo.parent_user_id) {
      return jsonRes({ error: "Este usuário é membro de equipe, não dono de conta" }, 400);
    }
    if (alvo.system_role === "platform_admin" || alvo.system_role === "admin") {
      return jsonRes({ error: "Não é permitido excluir um administrador" }, 400);
    }

    if (acao === "excluir") {
      if (alvo.deleted_at) return jsonRes({ error: "Tenant já está excluído" }, 409);

      // Só entra na exclusão (e na restauração) quem ainda não estava excluído.
      const { data: membros } = await admin
        .from("profiles")
        .select("id, is_active")
        .eq("parent_user_id", tenant_id)
        .is("deleted_at", null);
      const { data: canais } = await admin
        .from("canais")
        .select("id")
        .eq("user_id", tenant_id)
        .eq("is_active", true);

      const pessoas = [{ id: alvo.id, is_active: alvo.is_active }, ...(membros || [])];
      const ids = pessoas.map((p) => p.id);
      const canalIds = (canais || []).map((c) => c.id);

      // Snapshot primeiro: se algo falhar no meio, o restaurar ainda sabe o que religar.
      const { error: errLixeira } = await admin.from("lixeira_exclusoes").insert({
        owner_id: tenant_id,
        tabela: "profiles",
        comando: COMANDO,
        linha: {
          tenant_id,
          email: alvo.email,
          full_name: alvo.full_name,
          excluido_por: caller.id,
          pessoas,
          canais_ativos: canalIds,
        },
      });
      if (errLixeira) return jsonRes({ error: "Falha ao registrar exclusão: " + errLixeira.message }, 500);

      if (canalIds.length) {
        const { error } = await admin.from("canais").update({ is_active: false }).in("id", canalIds);
        if (error) return jsonRes({ error: "Falha ao desligar canais: " + error.message }, 500);
      }

      const { error: errProf } = await admin
        .from("profiles")
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .in("id", ids);
      if (errProf) return jsonRes({ error: "Falha ao marcar exclusão: " + errProf.message }, 500);

      const falhasBan: string[] = [];
      for (const id of ids) {
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: BAN_PERMANENTE });
        if (error) falhasBan.push(`${id}: ${error.message}`);
      }

      console.log(`[${COMANDO}] admin ${caller.id} excluiu tenant ${tenant_id} (${ids.length} contas, ${canalIds.length} canais)`);
      return jsonRes({
        success: true,
        contas: ids.length,
        canais: canalIds.length,
        ...(falhasBan.length ? { aviso: "Algumas contas não foram bloqueadas no login", falhas: falhasBan } : {}),
      });
    }

    // acao === "restaurar"
    if (!alvo.deleted_at) return jsonRes({ error: "Tenant não está excluído" }, 409);

    const { data: registro } = await admin
      .from("lixeira_exclusoes")
      .select("id, linha")
      .eq("owner_id", tenant_id)
      .eq("comando", COMANDO)
      .order("excluido_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Sem snapshot (excluído por fora deste fluxo): restaura só o dono, inativo.
    const linha = (registro?.linha || {}) as {
      pessoas?: { id: string; is_active: boolean | null }[];
      canais_ativos?: string[];
    };
    const pessoas = linha.pessoas?.length ? linha.pessoas : [{ id: alvo.id, is_active: false }];
    const canalIds = linha.canais_ativos || [];

    for (const p of pessoas) {
      const { error } = await admin
        .from("profiles")
        .update({ deleted_at: null, is_active: p.is_active !== false })
        .eq("id", p.id);
      if (error) return jsonRes({ error: "Falha ao restaurar conta: " + error.message }, 500);
      await admin.auth.admin.updateUserById(p.id, { ban_duration: "none" });
    }

    if (canalIds.length) {
      const { error } = await admin.from("canais").update({ is_active: true }).in("id", canalIds);
      if (error) return jsonRes({ error: "Contas restauradas, mas falhou religar canais: " + error.message }, 500);
    }

    // Registro consumido: uma nova exclusão gera um snapshot novo.
    if (registro?.id) await admin.from("lixeira_exclusoes").delete().eq("id", registro.id);

    console.log(`[${COMANDO}] admin ${caller.id} restaurou tenant ${tenant_id} (${pessoas.length} contas, ${canalIds.length} canais)`);
    return jsonRes({ success: true, contas: pessoas.length, canais: canalIds.length });
  } catch (err) {
    console.error(`Erro em ${COMANDO}:`, err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
