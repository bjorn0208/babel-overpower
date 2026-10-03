/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// postar-imagem-status — botão "📤 Status" de cada imagem da galeria do Rifas.
// Posta AQUELA arte no Status do WhatsApp do tenant logado (Base64 — sem
// depender da Z-API baixar URL) + espelho no chat do próprio chip.
// Segurança: verify_jwt=true + a imagem precisa ser do tenant do JWT.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

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
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: auth } = await admin.auth.getUser(jwt);
    const uid = auth?.user?.id;
    if (!uid) return json({ ok: false, erro: "nao_autenticado" }, 401);

    const { imagem_id } = (await req.json().catch(() => ({}))) as { imagem_id?: string };
    if (!imagem_id) return json({ ok: false, erro: "imagem_id_obrigatorio" }, 400);

    const { data: arte } = await admin
      .from("rifa_imagens")
      .select("id, url, legenda, tenant_id")
      .eq("id", imagem_id)
      .eq("tenant_id", uid)
      .is("deleted_at", null)
      .maybeSingle();
    if (!arte) return json({ ok: false, erro: "imagem_nao_encontrada" }, 404);

    const { data: canal } = await admin
      .from("canais")
      .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url, whatsapp_phone")
      .eq("user_id", uid)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .not("zapi_instance_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!canal) return json({ ok: false, erro: "whatsapp_nao_conectado" }, 400);

    // Baixa a arte e converte pra Base64 — prova de acessibilidade embutida.
    const resImg = await fetch(String(arte.url));
    if (!resImg.ok) return json({ ok: false, erro: `imagem inacessível (http ${resImg.status})` }, 502);
    const tipo = resImg.headers.get("content-type") ?? "image/png";
    const b64 = `data:${tipo};base64,${encodeBase64(new Uint8Array(await resImg.arrayBuffer()))}`;

    const base = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
    const headers = { "Content-Type": "application/json", "Client-Token": canal.zapi_security_token || "" };
    const caption = arte.legenda ?? "";

    const res = await fetch(`${base}/send-image-status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ image: b64, caption }),
    });
    if (!res.ok) {
      return json({ ok: false, erro: `Z-API recusou (http ${res.status}): ${(await res.text()).slice(0, 150)}` }, 502);
    }

    // Espelho verificável no chat do próprio chip.
    const fonePropio = String(canal.whatsapp_phone ?? "").replace(/\D/g, "");
    if (fonePropio.length >= 10) {
      await fetch(`${base}/send-image`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone: fonePropio, image: b64, caption: `[espelho do Status]\n${caption}` }),
      }).catch(() => undefined);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[postar-imagem-status] erro:", e);
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
