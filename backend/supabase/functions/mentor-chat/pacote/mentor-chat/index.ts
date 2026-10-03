// Edge function: mentor-chat
// Recebe o histórico do chat do Mentor e responde via OpenRouter,
// usando o modelo marcado como is_default em modelos_llm e a api_key
// do provedor 'openrouter' em provedores_llm. Registra log em logs_requisicao_llm.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Msg = { role: "system" | "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "nao_autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    if (!messages.length) {
      return new Response(JSON.stringify({ error: "messages_vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // service role para ler provedores_llm.api_key (RLS bloqueia leitura comum)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: modelo, error: errModelo } = await admin
      .from("modelos_llm")
      .select("id, slug, nome, provider_id, is_active")
      .eq("is_default", true)
      .maybeSingle();

    if (errModelo || !modelo) {
      return new Response(
        JSON.stringify({ error: "modelo_padrao_nao_definido" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: provedor, error: errProv } = await admin
      .from("provedores_llm")
      .select("slug, base_url, api_key, is_active")
      .eq("id", modelo.provider_id)
      .maybeSingle();

    if (errProv || !provedor || !provedor.api_key) {
      return new Response(
        JSON.stringify({ error: "provedor_sem_api_key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseUrl = (provedor.base_url || "https://openrouter.ai/api/v1").replace(/\/$/, "");
    const url = `${baseUrl}/chat/completions`;

    const sistema: Msg = {
      role: "system",
      content:
        "Você é o Mentor, copiloto operacional do Ragentic OS. Responda em pt-BR, " +
        "objetivo, com tom executivo. Se o usuário pedir KPI, leads, funil, receita ou abrir um app, " +
        "responda em texto curto pois a UI já entrega widgets dedicados.",
    };

    const t0 = Date.now();
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provedor.api_key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ragentic.app",
        "X-Title": "Ragentic OS — Mentor",
      },
      body: JSON.stringify({
        model: modelo.slug,
        messages: [sistema, ...messages].slice(-20),
        temperature: 0.4,
        max_tokens: 800,
      }),
    });

    const duracao_ms = Date.now() - t0;

    if (!upstream.ok) {
      const txt = await upstream.text();
      console.error("openrouter erro", upstream.status, txt);
      await admin.from("logs_requisicao_llm").insert({
        model_id: modelo.id,
        provider_id: provedor && (modelo as any).provider_id,
        model_slug: modelo.slug,
        provider_nome: provedor.slug,
        tokens_input: 0,
        tokens_output: 0,
        custo_total: 0,
        tipo: "mentor_chat",
        status: "erro",
        duracao_ms,
        erro: `${upstream.status}: ${txt.slice(0, 500)}`,
        metadata: { user_id: user.id },
      }).then(() => {}, () => {});
      return new Response(
        JSON.stringify({ error: "falha_openrouter", status: upstream.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = await upstream.json();
    const reply: string = json?.choices?.[0]?.message?.content ?? "";
    const usage = json?.usage ?? {};

    await admin.from("logs_requisicao_llm").insert({
      model_id: modelo.id,
      provider_id: (modelo as any).provider_id,
      model_slug: modelo.slug,
      provider_nome: provedor.slug,
      tokens_input: usage?.prompt_tokens ?? 0,
      tokens_output: usage?.completion_tokens ?? 0,
      custo_total: 0,
      tipo: "mentor_chat",
      status: "ok",
      duracao_ms,
      metadata: { user_id: user.id },
    }).then(() => {}, () => {});

    return new Response(
      JSON.stringify({
        reply,
        modelo: { slug: modelo.slug, nome: modelo.nome },
        duracao_ms,
        usage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("mentor-chat erro:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "erro_desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});