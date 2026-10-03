import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
/**
 * Convida um membro de equipe.
 * - Cria usuário em auth.users (admin.createUser, email pré-confirmado)
 * - O trigger `processar_novo_usuario` cria o profile com parent_user_id
 *   (validado contra um tenant real via metadata `convidado_por`).
 * - Faz upsert idempotente do profile pra garantir vínculo + status válidos.
 *
 * A senha é DEFINIDA por quem convida (não temporária). Cargo NÃO vem daqui —
 * o próprio membro define em Configurações (`profiles.cargo`).
 * O apelido é o login do membro no Porteiro (citext único).
 *
 * Auth: usa o JWT do chamador pra descobrir o uid; só o próprio tenant pode
 * convidar membros pra sua equipe. RLS continua valendo no resto do app.
 *
 * 2026-09-24 (base: versão 24 no ar, ver ORIGINAL-NO-AR-V24.ts): "Remover" na Equipe só marca o membro como removido
 * (soft delete) e mantém o login. Por isso cadastrar de novo a mesma pessoa falhava sempre ("já existe") e a tela
 * mostrava só "Não foi possível adicionar o membro". Agora:
 *   - mesmo e-mail de um membro REMOVIDO da PRÓPRIA equipe → REATIVA esse membro (mesmo id e histórico), com o
 *     nome, o apelido e a senha informados agora, sem os acessos antigos (page_permissions vazio e acesso à Gestão
 *     revogado em gestao_acessos);
 *   - e-mail comparado por igualdade exata; e-mail com caractere de curinga é recusado (nada de sonda);
 *   - e-mail de um membro ATIVO, ou de outra conta → erro claro `email_em_uso`;
 *   - apelido de um membro REMOVIDO da própria equipe → erro claro `apelido_de_membro_removido`;
 *   - todo erro volta com um código conhecido, para a tela dizer o motivo.
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
    // Identifica o chamador via anon + token
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
    const nome = String(body.nome ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const senha = String(body.senha ?? "").trim();
    const apelido = String(body.apelido ?? "").trim();
    if (!nome || !email || !senha || !apelido) return json({
      error: "campos_obrigatorios"
    }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({
      error: "email_invalido"
    }, 400);
    if (senha.length < 6) return json({
      error: "senha_curta"
    }, 400);
    // Apelido = login no Porteiro. Sem espaço/acento, 2-64 chars.
    if (!/^[A-Za-z0-9._-]{2,64}$/.test(apelido)) return json({
      error: "apelido_invalido"
    }, 400);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Curingas de busca nunca entram (B-CM1, Serjão: com ilike, `*`/`%` virariam sonda para descobrir e-mails alheios).
    if (/[*%\\,()]/.test(email)) return json({
      error: "email_invalido"
    }, 400);
    // Já existe perfil com este e-mail? Comparação EXATA (eq), sem curinga. O e-mail já está em minúsculas; o login
    // do Supabase guarda e-mail em minúsculas e esta função sempre gravou assim.
    const { data: comEmail, error: emailErr } = await admin.from("profiles")
      .select("id, parent_user_id, deleted_at")
      .eq("email", email)
      .limit(2);
    if (emailErr) return json({
      error: "erro_consulta"
    }, 500);
    // Mais de um perfil com o mesmo e-mail: não escolhe um — trata como em uso.
    if ((comEmail ?? []).length > 1) return json({
      error: "email_em_uso"
    }, 409);
    const existente = (comEmail ?? [])[0] ?? null;

    // Apelido é único (citext, case-insensitive). Na reativação, o apelido do próprio membro não conta.
    const { data: apelidoUsado } = await admin.from("profiles")
      .select("id, parent_user_id, deleted_at")
      .eq("apelido", apelido)
      .maybeSingle();
    if (apelidoUsado && apelidoUsado.id !== existente?.id) {
      const deMembroRemovido = !!apelidoUsado.deleted_at && apelidoUsado.parent_user_id === chamador.id;
      return json({
        error: deMembroRemovido ? "apelido_de_membro_removido" : "apelido_em_uso"
      }, 409);
    }

    if (existente) {
      const removidoDaMinhaEquipe = !!existente.deleted_at && existente.parent_user_id === chamador.id;
      if (!removidoDaMinhaEquipe) return json({
        error: "email_em_uso"
      }, 409);
      // B-CM2 (Serjão): "sem os acessos antigos" vale também para o app Gestão: o acesso antigo (gestao_acessos) é
      // revogado ANTES de reativar (aviso A-CM2-R2: se falhar, a pessoa continua removida, nunca ativa com o papel
      // antigo). O dono dá a função de novo na Equipe.
      const { error: gestaoErr } = await admin.from("gestao_acessos")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", existente.id)
        .is("deleted_at", null);
      if (gestaoErr) return json({
        error: "erro_reativar_perfil"
      }, 400);
      // REATIVAR: mesmo login e mesmo histórico, com os dados informados agora (ban_duration "none" desbloqueia o
      // login que remover-membro bloqueou).
      const { error: authUpdErr } = await admin.auth.admin.updateUserById(existente.id, {
        password: senha,
        email_confirm: true,
        ban_duration: "none",
        user_metadata: {
          full_name: nome,
          convidado_por: chamador.id
        }
      });
      if (authUpdErr) return json({
        error: "erro_reativar_login"
      }, 400);
      // parent_user_id e system_role NÃO mudam (o gatilho prevenir_mudanca_campo_critico barraria).
      const { error: reativarErr } = await admin.from("profiles").update({
        deleted_at: null,
        is_active: true,
        account_status: "ativo",
        full_name: nome,
        apelido,
        page_permissions: []
      }).eq("id", existente.id).eq("parent_user_id", chamador.id);
      if (reativarErr) return json({
        error: "erro_reativar_perfil"
      }, 400);
      return json({
        id: existente.id,
        email,
        reativado: true
      }, 200);
    }

    // 1. cria usuário no auth (o trigger cria o profile com parent_user_id)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: {
        full_name: nome,
        convidado_por: chamador.id
      }
    });
    if (createErr || !created.user) {
      // login já existe sem perfil nesta base (ex.: conta de outro sistema): motivo claro, sem expor a mensagem crua
      const jaExiste = /already|registered|exists/i.test(createErr?.message ?? "");
      return json({
        error: jaExiste ? "email_em_uso" : "erro_criar_usuario"
      }, jaExiste ? 409 : 400);
    }
    // 2. upsert idempotente do profile — garante vínculo e status válidos.
    //    account_status segue o CHECK em pt-BR: 'ativo' | 'inativo' | 'pendente'.
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: created.user.id,
      email,
      full_name: nome,
      apelido,
      parent_user_id: chamador.id,
      system_role: "user",
      account_status: "ativo",
      is_active: true
    });
    if (profileErr) {
      // limpa o usuário órfão se o profile não pôde ser gravado
      await admin.auth.admin.deleteUser(created.user.id).catch(()=>{});
      return json({
        error: "erro_gravar_perfil"
      }, 400);
    }
    return json({
      id: created.user.id,
      email
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
