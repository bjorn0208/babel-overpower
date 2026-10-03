/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

import { corsOk, jsonRes } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

const LATENCIA_MINIMA_MS = 600;
const JITTER_MAX_MS = 50;
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function aguardarLatenciaMinima(t0: number): Promise<void> {
  const jitter = Math.floor(Math.random() * JITTER_MAX_MS);
  const alvo = LATENCIA_MINIMA_MS + jitter;
  const decorrido = Date.now() - t0;
  if (decorrido < alvo) await sleep(alvo - decorrido);
}

async function validarTurnstile(
  token: string | null,
  ip: string,
): Promise<boolean> {
  const secret = Deno.env.get("CLOUDFLARE_TURNSTILE_SECRET");
  if (!secret) return true;
  if (!token) return false;

  try {
    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", token);
    formData.append("remoteip", ip);

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) return false;
    const json = await res.json();
    return Boolean(json?.success);
  } catch (_e) {
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return corsOk();
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405);

  const t0 = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const apelido = String(body?.apelido ?? "").trim().toLowerCase();
    const senha = String(body?.senha ?? "");
    const turnstileToken = body?.turnstileToken
      ? String(body.turnstileToken)
      : null;

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "desconhecido";

    async function falhar(): Promise<Response> {
      await aguardarLatenciaMinima(t0);
      return jsonRes({ ok: false }, 200);
    }

    if (!apelido || apelido.length < 2 || apelido.length > 64) {
      return falhar();
    }
    if (!senha || senha.length < 6 || senha.length > 256) {
      return falhar();
    }

    const supabase = criarClienteAdmin();

    const { data: rl } = await supabase.rpc("verificar_limite_taxa", {
      p_identifier: `login:${ip}`,
      p_endpoint: "login-commandbar",
      p_max_requests: 10,
      p_window_seconds: 300,
    });
    if (rl === false) {
      await aguardarLatenciaMinima(t0);
      return jsonRes({ ok: false, motivo_interno: "rate_limit" }, 429);
    }

    const turnstileOk = await validarTurnstile(turnstileToken, ip);
    if (!turnstileOk) {
      return falhar();
    }

    const { data: emailLookup } = await supabase.rpc("email_de_apelido", {
      p_apelido: apelido,
    });
    const email = typeof emailLookup === "string" ? emailLookup : null;

    const emailParaAuth = email || `naoexiste-${apelido}@plataformalimpa.invalido`;
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: emailParaAuth,
        password: senha,
      });

    if (authError || !authData?.session) {
      return falhar();
    }

    await aguardarLatenciaMinima(t0);

    return jsonRes({
      ok: true,
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      user: { id: authData.user?.id, email: authData.user?.email },
    }, 200);
  } catch (err) {
    console.error("login-commandbar erro inesperado:", err);
    await aguardarLatenciaMinima(t0);
    return jsonRes({ ok: false }, 200);
  }
});
