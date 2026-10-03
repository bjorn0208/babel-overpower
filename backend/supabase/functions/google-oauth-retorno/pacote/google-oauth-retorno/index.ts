/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// google-oauth-retorno — callback do consentimento Google (GET com ?code&state).
// Valida o state assinado, troca o code por tokens, garante o calendário
// "Babel OS" e grava a conexão do tenant. verify_jwt=false (é o navegador do
// dono voltando do Google — a prova de identidade é o state HMAC).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { emailDoIdToken, garantirCalendarioBabel, trocarCodePorTokens, validarState } from "../_shared/google-agenda.ts";

const base64Hash = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Tudo que entra no HTML passa por escape — `error`/mensagens vêm da URL (XSS).
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const pagina = (titulo: string, corpo: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${esc(titulo)}</title>` +
    `<body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;background:#0b0b12;color:#eee">` +
    `<div style="max-width:420px;text-align:center"><h1 style="font-size:22px">${esc(titulo)}</h1>` +
    `<p style="color:#aaa;line-height:1.6">${esc(corpo)}</p></div></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      },
    },
  );

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const erroGoogle = url.searchParams.get("error");
    if (erroGoogle) return pagina("Conexão cancelada", `O Google devolveu: ${erroGoogle}. Pode fechar esta aba e tentar de novo.`, 400);
    if (!code || !state) return pagina("Algo não bate", "Faltou code ou state no retorno do Google.", 400);

    const tenantId = await validarState(state);
    if (!tenantId) return pagina("Algo não bate", "Link de conexão expirado ou inválido — gere um novo no app.", 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Anti-replay: cada state vale UMA vez (segunda passada bate no PK e cai aqui).
    const stateHash = base64Hash(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state)));
    const { error: erroReplay } = await admin.from("google_oauth_estados_usados").insert({ state_hash: stateHash });
    if (erroReplay) return pagina("Algo não bate", "Este link de conexão já foi usado — gere um novo no app.", 400);

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-oauth-retorno`;
    const tokens = await trocarCodePorTokens(code, redirectUri);
    if (!tokens.refresh_token) {
      return pagina("Quase lá", "O Google não devolveu o refresh_token. Desconecte o app em myaccount.google.com/permissions e conecte de novo.", 400);
    }

    const calendarioBabel = await garantirCalendarioBabel(tokens.access_token);
    const email = emailDoIdToken(tokens.id_token);

    const { error } = await admin.from("conexoes_google").upsert({
      tenant_id: tenantId,
      google_email: email,
      refresh_token: tokens.refresh_token,
      calendario_babel_id: calendarioBabel,
      escopos: "openid email calendar",
      atualizado_em: new Date().toISOString(),
      deleted_at: null,
    });
    if (error) throw new Error(`gravar conexão falhou: ${error.message}`);

    // Identifica ONDE a agenda foi pendurada — se alguém foi induzido a clicar
    // num link de conexão alheio, vê aqui que a conta Babel não é a dele e desfaz.
    const { data: perfil } = await admin.from("profiles").select("email").eq("id", tenantId).maybeSingle();

    return pagina(
      "Agenda conectada ✅",
      `Conta Google ${email ?? ""} conectada à conta Babel de ${perfil?.email ?? tenantId}. ` +
        `Retornos da Babel vão pro calendário "Babel OS"; reuniões vão pra sua agenda principal. ` +
        `NÃO foi você que iniciou esta conexão? Desfaça em myaccount.google.com/permissions e avise o suporte.`,
    );
  } catch (e) {
    console.error("[google-oauth-retorno] erro:", e);
    return pagina("Algo não bate", e instanceof Error ? e.message : String(e), 500);
  }
});
