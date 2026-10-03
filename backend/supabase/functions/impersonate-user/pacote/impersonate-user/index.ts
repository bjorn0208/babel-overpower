import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Impersonação de usuário (admin → tenant ou membro de equipe).
 * - Valida que o chamador é admin de plataforma (eh_super_admin).
 * - Gera magic link para o alvo e consome o token no servidor.
 * - Registra o evento em impersonation_log (auditoria).
 *
 * Body: { target_user_id: string, motivo?: string }
 * Retorna sessão Supabase do usuário alvo, sem expor service_role.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "no_auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "invalid_token" }, 401);
    const chamador = userData.user;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Confirma admin de plataforma — aceita user_roles.role contendo 'admin'
    // OU profiles.system_role contendo 'admin' (admin / platform_admin / super_admin).
    const [{ data: roles, error: roleErr }, { data: perfilAdm, error: profErr }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", chamador.id),
      admin.from("profiles").select("system_role").eq("id", chamador.id).maybeSingle(),
    ]);
    if (roleErr || profErr) {
      return json({ error: "erro_validar_role", detail: roleErr?.message ?? profErr?.message }, 500);
    }
    // 2026-09-17: o teste era /admin/i (qualquer papel CONTENDO "admin", inclusive
    // um cargo de equipe chamado "admin de vendas", virava impersonação de
    // qualquer usuário). Agora é igualdade exata, igual às outras edges admin.
    const PAPEIS_ADMIN = ["platform_admin", "super_admin", "admin"];
    const ehAdmin =
      (roles ?? []).some((r: any) => PAPEIS_ADMIN.includes(String(r.role ?? "").trim().toLowerCase())) ||
      PAPEIS_ADMIN.includes(String((perfilAdm as any)?.system_role ?? "").trim().toLowerCase());
    if (!ehAdmin) {
      return json({
        error: "forbidden",
        detail: "usuário sem papel admin",
      }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const target_user_id = String(body.target_user_id ?? "").trim();
    const motivo = body.motivo ? String(body.motivo).slice(0, 500) : null;
    if (!target_user_id) return json({ error: "target_user_id_obrigatorio" }, 400);

    // Busca e-mail do alvo
    const { data: alvo, error: alvoErr } = await admin
      .from("profiles")
      .select("id, email, full_name, is_active")
      .eq("id", target_user_id)
      .maybeSingle();
    if (alvoErr || !alvo) return json({ error: "alvo_nao_encontrado" }, 404);
    if (!alvo.email) return json({ error: "alvo_sem_email" }, 400);
    if (alvo.is_active === false) return json({ error: "alvo_inativo" }, 400);

    // Gera token de magic link e consome no servidor para eliminar a rota /impersonar + verifyOtp no browser.
    const origemAplicacao = resolverOrigemAplicacao(req);
    const redirectTo = origemAplicacao ? `${origemAplicacao}/impersonar?impersonacao=1` : undefined;
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: alvo.email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ error: "erro_gerar_link: " + (linkErr?.message ?? "?") }, 500);
    }
    const verificationType = linkData.properties.verification_type ?? "magiclink";
    const sessaoAlvo = await consumirMagicLinkNoServidor(
      SUPABASE_URL,
      ANON,
      linkData.properties.hashed_token,
      verificationType,
    );
    if (sessaoAlvo.error || !sessaoAlvo.session?.access_token || !sessaoAlvo.session?.refresh_token) {
      return json({ error: "erro_consumir_link", detail: sessaoAlvo.error ?? "sessao_alvo_ausente" }, 500);
    }

    // Registra auditoria
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null;
    const ua = req.headers.get("user-agent") || null;
    const { data: log, error: logErr } = await admin
      .from("impersonation_log")
      .insert({
        admin_id: chamador.id,
        target_user_id: alvo.id,
        motivo,
        ip_address: ip,
        user_agent: ua,
      })
      .select("id")
      .maybeSingle();
    if (logErr) console.warn("[impersonate-user] log:", logErr.message);

    return json({
      access_token: sessaoAlvo.session.access_token,
      refresh_token: sessaoAlvo.session.refresh_token,
      expires_at: sessaoAlvo.session.expires_at ?? null,
      expires_in: sessaoAlvo.session.expires_in ?? null,
      token_type: sessaoAlvo.session.token_type ?? "bearer",
      log_id: log?.id ?? null,
      target: { id: alvo.id, email: alvo.email, full_name: alvo.full_name },
    }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function resolverOrigemAplicacao(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const referer = req.headers.get("referer");
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch {
    return referer.replace(/\/$/, "");
  }
}

async function consumirMagicLinkNoServidor(
  supabaseUrl: string,
  anonKey: string,
  tokenHash: string,
  tipo: string,
) {
  const resp = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify({ token_hash: tokenHash, type: tipo }),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { error: payload?.error_description || payload?.msg || payload?.error || `verify_${resp.status}` };
  }
  return { session: payload };
}