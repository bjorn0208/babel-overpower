/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// google-conectar — devolve a URL de consentimento do Google pro dono logado
// conectar a agenda dele (1 clique). O state vai assinado (HMAC) pra ninguém
// conectar agenda em nome de outro tenant. Segurança: verify_jwt=true.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { assinarState } from "../_shared/google-agenda.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo_invalido" }, 405);

  try {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!clientId) return json({ ok: false, erro: "GOOGLE_CLIENT_ID ausente — rodar supabase secrets set" }, 500);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: auth } = await admin.auth.getUser(jwt);
    const uid = auth?.user?.id;
    if (!uid) return json({ ok: false, erro: "nao_autenticado" }, 401);

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-oauth-retorno`;
    const state = await assinarState(uid);
    const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email https://www.googleapis.com/auth/calendar",
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();

    // Status atual junto — o app mostra "conectado como x@gmail.com" sem outra edge.
    const { data: conexao } = await admin
      .from("conexoes_google")
      .select("google_email, conectado_em")
      .eq("tenant_id", uid)
      .is("deleted_at", null)
      .maybeSingle();

    return json({ ok: true, url, conectado: Boolean(conexao), google_email: conexao?.google_email ?? null });
  } catch (e) {
    console.error("[google-conectar] erro:", e);
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
