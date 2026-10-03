/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// cron-aviso-sorteio-rifa — roda a cada 5 min. Quando falta ~10 min pro
// sorteio de uma rifa ativa, a Luci avisa os COMPRADORES (pedidos pagos) pra
// ficarem de olho no Status, e posta o mesmo aviso no Status. Dispara 1x por
// rifa (rifas.aviso_10min_em marca).
//
// Hora do sorteio: rifas.data_sorteio_prevista (date, opcional) + o campo
// hora_sorteio da arte mais recente da galeria ("19h", "19:30", "19h30").
// Sem hora na arte = sem aviso (não chuta horário).
//
// Entrega aos compradores pela caixa_saida_mensagens (ritmo anti-ban).
// Segurança: verify_jwt=false; Bearer == env OU vault via ler_segredo_cron.

import { createClient } from "jsr:@supabase/supabase-js@2";

const JANELA_MIN = 10;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

/** "19h" / "19:30" / "19h30" / "7" → minutos do dia, ou null. */
function parseHora(txt: string | null): number | null {
  if (!txt) return null;
  const m = txt.trim().match(/^(\d{1,2})\s*[:hH]?\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const diaBRT = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const minutosAgoraBRT = () => {
  const d = new Date(Date.now() - 3 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function enfileirarBolha(supabase: Sb, conversaId: string, tenantId: string, texto: string) {
  const { data: msgRow } = await supabase
    .from("mensagens")
    .insert({ conversation_id: conversaId, role: "assistant", content: texto })
    .select("id")
    .single();
  await supabase.from("caixa_saida_mensagens").insert({
    conversation_id: conversaId,
    tenant_id: tenantId,
    status: "pendente",
    content: texto,
    bubble_order: 0,
    scheduled_at: new Date().toISOString(),
    delay_calculado_ms: 0,
    engagement_level: "quente",
    carga: { assistant_message_id: msgRow?.id, typing_ms: 3000, delay_message_s: 0, origem: "aviso_sorteio_rifa" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, erro: "metodo_invalido" }, 405);

  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, chaveServico);

  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  let autorizado = bearer.length > 0 && bearer === chaveServico;
  if (!autorizado && bearer.length > 0) {
    const { data: segredoCron } = await supabase.rpc("ler_segredo_cron");
    autorizado = typeof segredoCron === "string" && segredoCron.length > 0 && bearer === segredoCron;
  }
  if (!autorizado) return json({ ok: false, erro: "nao_autorizado" }, 401);

  const hoje = diaBRT();
  const agoraMin = minutosAgoraBRT();

  const { data: rifas } = await supabase
    .from("rifas")
    .select("id, tenant_id, titulo, data_sorteio_prevista, hora_sorteio")
    .eq("status", "ativa")
    .is("deleted_at", null)
    .is("aviso_10min_em", null);

  let avisados = 0;
  let rifasAvisadas = 0;

  for (const rifa of rifas ?? []) {
    if (rifa.data_sorteio_prevista && String(rifa.data_sorteio_prevista) !== hoje) continue;

    // Hora do sorteio: `rifas.hora_sorteio` manda (Mig `rifas_hora_sorteio`,
    // 2026-09-06); a arte da galeria continua valendo de fallback pro que já
    // estava cadastrado antes da coluna existir. Mesma ordem de resolução que
    // `_shared/tools-rifas.ts` usa pra responder o lead — se divergir, o agente
    // promete um horário e o aviso dispara em outro.
    let horaTexto: string | null = rifa.hora_sorteio ?? null;
    if (!horaTexto) {
      const { data: arte } = await supabase
        .from("rifa_imagens")
        .select("hora_sorteio")
        .eq("rifa_id", rifa.id)
        .is("deleted_at", null)
        .not("hora_sorteio", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      horaTexto = arte?.hora_sorteio ?? null;
    }
    const alvoMin = parseHora(horaTexto);
    if (alvoMin === null) continue;
    if (agoraMin < alvoMin - JANELA_MIN || agoraMin >= alvoMin) continue;

    const { data: canal } = await supabase
      .from("canais")
      .select("zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url")
      .eq("user_id", rifa.tenant_id)
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .not("zapi_instance_id", "is", null)
      .limit(1)
      .maybeSingle();
    const { data: agente } = await supabase
      .from("agentes")
      .select("id")
      .eq("user_id", rifa.tenant_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!canal || !agente) continue;

    const texto =
      `O sorteio da ${rifa.titulo} sai em ~10 minutos! ` +
      `Fica de olho no meu Status que o resultado aparece por lá nos próximos minutos 👀`;

    // Compradores pagos (1 aviso por telefone).
    const { data: pedidos } = await supabase
      .from("pedidos_rifa")
      .select("phone")
      .eq("rifa_id", rifa.id)
      .eq("status", "pago");
    const fones = [...new Set((pedidos ?? []).map((p: { phone: string }) => String(p.phone ?? "").replace(/\D/g, "")).filter((f: string) => f.length >= 10))];

    for (const fone of fones) {
      const { data: conv } = await supabase.rpc("buscar_ou_criar_conversa", {
        p_phone: fone,
        p_tenant_id: rifa.tenant_id,
        p_agent_id: agente.id,
        p_channel: "whatsapp",
        p_first_fase: "saudacao",
      });
      const conversaId = conv?.conversation?.id;
      if (!conversaId) continue;
      await enfileirarBolha(supabase, conversaId, rifa.tenant_id, texto);
      avisados++;
    }

    // Mesmo aviso no Status (texto curto e direto).
    try {
      const base = `${canal.zapi_api_url || "https://api.z-api.io"}/instances/${canal.zapi_instance_id}/token/${canal.zapi_token}`;
      await fetch(`${base}/send-text-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": canal.zapi_security_token || "" },
        body: JSON.stringify({ message: `Sorteio da ${rifa.titulo} em ~10 minutos! Resultado sai aqui no Status.` }),
      });
    } catch (e) {
      console.error(`[cron-aviso-sorteio-rifa] status falhou rifa=${rifa.id}:`, e);
    }

    await supabase.from("rifas").update({ aviso_10min_em: new Date().toISOString() }).eq("id", rifa.id);
    rifasAvisadas++;
  }

  return json({ ok: true, rifas_avisadas: rifasAvisadas, compradores_avisados: avisados });
});
