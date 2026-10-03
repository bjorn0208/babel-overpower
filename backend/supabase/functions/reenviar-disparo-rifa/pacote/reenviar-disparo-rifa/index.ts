/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// reenviar-disparo-rifa — botão de reenvio da aba Disparo (envios ao vivo).
// Repete 1 envio específico (mesma mensagem já registrada em
// rifa_disparo_envios.mensagem_enviada) e grava uma NOVA linha de tentativa
// — histórico completo, não sobrescreve a falha original.
//
// verify_jwt=true — chamada só pelo painel, com o JWT do tenant dono.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function jsonResp(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, chaveServico);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ ok: false, erro: "unauthorized" }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return jsonResp({ ok: false, erro: "unauthorized" }, 401);

    const { envio_id } = (await req.json().catch(() => ({}))) as { envio_id?: string };
    if (!envio_id) return jsonResp({ ok: false, erro: "envio_id obrigatorio" }, 400);

    const { data: envio } = await supabase
      .from("rifa_disparo_envios")
      .select("id, tenant_id, agendamento_id, rifa_id, lista_disparo_id, phone, mensagem_enviada")
      .eq("id", envio_id)
      .maybeSingle();
    if (!envio) return jsonResp({ ok: false, erro: "envio nao encontrado" }, 404);
    if (envio.tenant_id !== user.id) return jsonResp({ ok: false, erro: "forbidden" }, 403);

    let tipoConteudo = "texto";
    let midiaUrl: string | null = null;
    if (envio.agendamento_id) {
      const { data: ag } = await supabase
        .from("rifa_agendamentos_disparo")
        .select("tipo_conteudo, midia_url")
        .eq("id", envio.agendamento_id)
        .maybeSingle();
      if (ag?.tipo_conteudo) tipoConteudo = ag.tipo_conteudo;
      midiaUrl = ag?.midia_url ?? null;
    }

    const { data: canal } = await supabase
      .from("canais")
      .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url")
      .eq("user_id", envio.tenant_id)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .not("zapi_instance_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!canal) return jsonResp({ ok: false, erro: "canal whatsapp nao configurado" });

    // Mesma regra de `processar-disparos-rifa`: mídia própria primeiro; cartela
    // auto-gerada só serve de fallback pra foto/foto_texto, nunca pra vídeo.
    let urlImagem: string | null = midiaUrl;
    if (!urlImagem && tipoConteudo !== "texto" && tipoConteudo !== "video") {
      const { data: arte } = await supabase
        .from("rifa_imagens")
        .select("url")
        .eq("rifa_id", envio.rifa_id)
        .eq("tipo", "cartela")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      urlImagem = arte?.url ?? null;
    }

    const base = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
    const headers = { "Content-Type": "application/json", "Client-Token": canal.zapi_security_token || "" };
    const mensagem = envio.mensagem_enviada ?? "";
    const delayTyping = 1 + Math.round(Math.random() * 2);
    const delayMessage = 1 + Math.round(Math.random() * 2);

    let rota: string;
    let payload: Record<string, unknown>;
    if (tipoConteudo === "texto") {
      rota = "send-text";
      payload = { phone: envio.phone, message: mensagem, delayTyping, delayMessage };
    } else if (tipoConteudo === "video") {
      rota = "send-video";
      payload = { phone: envio.phone, video: urlImagem, caption: mensagem, delayMessage };
    } else {
      rota = "send-image";
      payload = { phone: envio.phone, image: urlImagem, caption: tipoConteudo === "foto_texto" ? mensagem : undefined, delayMessage };
    }

    let status: "sucesso" | "erro" = "sucesso";
    let erroDetalhe: string | null = null;
    try {
      if (tipoConteudo === "video" && !urlImagem) throw new Error("tipo vídeo sem mídia anexada");
      if (tipoConteudo !== "texto" && tipoConteudo !== "video" && !urlImagem) throw new Error("sem imagem atual da rifa (galeria vazia) nem mídia própria anexada");
      const res = await fetch(`${base}/${rota}`, { method: "POST", headers, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`Z-API status ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      status = "erro";
      erroDetalhe = e instanceof Error ? e.message : String(e);
    }

    await supabase.from("rifa_disparo_envios").insert({
      tenant_id: envio.tenant_id,
      agendamento_id: envio.agendamento_id,
      rifa_id: envio.rifa_id,
      lista_disparo_id: envio.lista_disparo_id,
      phone: envio.phone,
      status,
      mensagem_enviada: mensagem,
      erro_detalhe: erroDetalhe,
    });

    if (status === "erro") return jsonResp({ ok: false, erro: erroDetalhe });
    return jsonResp({ ok: true });
  } catch (e) {
    console.error("reenviar-disparo-rifa error:", e);
    return jsonResp({ ok: false, erro: (e as Error).message }, 500);
  }
});
