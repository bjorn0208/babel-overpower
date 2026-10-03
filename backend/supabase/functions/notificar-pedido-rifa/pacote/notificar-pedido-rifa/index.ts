/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// Notifica o comprador da rifa no WhatsApp (canal Z-API do tenant).
//
// Por quê: a compra pelo link público acontecia em silêncio — o comprador
// fechava a página e ficava sem os números, sem a chave PIX e sem saber
// quando o pagamento era confirmado. Esta edge fecha o ciclo:
//   evento "reserva" → números + valor + chave PIX + link de acompanhamento
//   evento "pago"    → pagamento confirmado (+ cotas premiadas ganhas)
//
// Segurança: verify_jwt=false (chamada da página pública e do app), mas NADA
// vem do cliente além do token do pedido + evento — a mensagem inteira nasce
// do estado REAL do banco (status compatível é exigido), então o pior abuso
// possível é reenviar uma verdade. Rate limit 10/h por phone via
// `verificar_limite_taxa_publico` corta spam de reenvio.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const fmtBRL = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Espelho TS do SQL `normalizar_telefone_brasil` — pedidos antigos podem ter
// phone sem DDI 55 (a Z-API aceita o envio e a mensagem morre em silêncio).
const normalizarTelefoneBrasil = (bruto: string): string | null => {
  const v = (bruto ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (/^55\d{10,11}$/.test(v)) return v;
  if (/^\d{10,11}$/.test(v)) return "55" + v;
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo_invalido" }, 405);

  try {
    const { token, evento } = (await req.json().catch(() => ({}))) as {
      token?: string;
      evento?: string;
    };
    if (!token || !["reserva", "pago"].includes(evento ?? "")) {
      return json({ ok: false, erro: "token_e_evento_obrigatorios" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pedido + rifa — a chave_publica do pedido é o segredo de acesso.
    const { data: pedido } = await supabase
      .from("pedidos_rifa")
      .select("id, tenant_id, rifa_id, nome, phone, numeros, qtd_numeros, valor_centavos, status, chave_publica")
      .eq("chave_publica", token)
      .maybeSingle();
    if (!pedido) return json({ ok: false, erro: "pedido_nao_encontrado" }, 404);

    // Evento precisa bater com o estado REAL — impede forjar "pagamento confirmado".
    const statusOk = evento === "reserva"
      ? ["reservado", "aguardando_validacao"].includes(pedido.status)
      : pedido.status === "pago";
    if (!statusOk) return json({ ok: false, erro: "status_incompativel" }, 409);

    const phoneNormalizado = normalizarTelefoneBrasil(pedido.phone);
    if (!phoneNormalizado) return json({ ok: false, erro: "telefone_invalido" }, 422);

    // Rate limit por phone (10/h) — reenvio manual é ok, spam não.
    const { data: dentroDoLimite } = await supabase.rpc("verificar_limite_taxa_publico", {
      p_identifier: phoneNormalizado,
      p_endpoint: "rifa_notif",
      p_max_per_hour: 10,
    });
    if (dentroDoLimite === false) return json({ ok: false, erro: "limite_excedido" }, 429);

    const { data: rifa } = await supabase
      .from("rifas")
      .select("titulo, chave_publica, cotas_premiadas, total_numeros, numeracao_desde_zero")
      .eq("id", pedido.rifa_id)
      .maybeSingle();

    const { data: canal } = await supabase
      .from("canais")
      .select("zapi_api_url, zapi_instance_id, zapi_token, zapi_security_token")
      .eq("user_id", pedido.tenant_id)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!canal?.zapi_instance_id) return json({ ok: false, erro: "tenant_sem_canal_whatsapp" }, 422);

    // Rifas desde zero exibem 00..total-1 (zero à esquerda na largura do maior número).
    const larguraRotulo = String(Math.max(1, (rifa?.total_numeros ?? 100) - 1)).length;
    const rotuloNumero = (n: number): string =>
      rifa?.numeracao_desde_zero ? String(n).padStart(larguraRotulo, "0") : String(n);
    const numeros = (pedido.numeros ?? []).map(rotuloNumero).join(", ");
    const linkPedido = `${Deno.env.get("APP_PUBLIC_URL") ?? "https://www.plataformalimpa.com.br"}/rifa/${rifa?.chave_publica}?pedido=${pedido.chave_publica}`;

    let mensagem: string;
    if (evento === "reserva") {
      // Chave PIX com o mesmo COALESCE das RPCs públicas: config das rifas → perfil.
      const [{ data: cfg }, { data: perfil }] = await Promise.all([
        supabase.from("rifas_config_tenant").select("chave_pix").eq("tenant_id", pedido.tenant_id).maybeSingle(),
        supabase.from("profiles").select("chave_pix").eq("id", pedido.tenant_id).maybeSingle(),
      ]);
      const chavePix = cfg?.chave_pix || perfil?.chave_pix || null;
      mensagem =
        `🎟️ *Pedido recebido — ${rifa?.titulo ?? "Rifa"}*\n\n` +
        `Olá, ${pedido.nome}! Seus números: *${numeros}*\n` +
        `Total: *${fmtBRL(pedido.valor_centavos)}*\n\n` +
        (chavePix ? `💳 Pague via PIX: *${chavePix}*\n\n` : "") +
        `Depois envie o comprovante e acompanhe seu pedido aqui:\n${linkPedido}`;
    } else {
      const cotasGanhas = ((rifa?.cotas_premiadas ?? []) as Array<{ numero: number; premio: string; pedido_ganhador?: string | null }>)
        .filter((c) => c.pedido_ganhador === pedido.id);
      mensagem =
        `✅ *Pagamento confirmado — ${rifa?.titulo ?? "Rifa"}*\n\n` +
        `${pedido.nome}, seus números *${numeros}* estão garantidos! 🍀\n` +
        (cotasGanhas.length > 0
          ? `\n🎁 Você levou cota premiada: ${cotasGanhas.map((c) => `nº ${rotuloNumero(c.numero)} (${c.premio})`).join(", ")}!\n`
          : "") +
        `\nAcompanhe o sorteio por aqui:\n${linkPedido}`;
    }

    const zapiBase = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
    const envio = await fetch(`${zapiBase}/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": canal.zapi_security_token || "" },
      body: JSON.stringify({ phone: phoneNormalizado, message: mensagem }),
    });
    if (!envio.ok) {
      console.error("[notificar-pedido-rifa] zapi falhou:", envio.status, await envio.text().catch(() => ""));
      return json({ ok: false, erro: "falha_envio_whatsapp" }, 502);
    }

    return json({ ok: true, evento });
  } catch (e) {
    console.error("[notificar-pedido-rifa] erro:", (e as Error).message);
    return json({ ok: false, erro: "erro_interno" }, 500);
  }
});
