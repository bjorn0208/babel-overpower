/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// cron-retomar-agente — edge function server-to-server (verify_jwt: false).
// Disparada 1×/min via pg_cron. Varre acoes_agendadas com
// action_type='retomada_agente_propria' e status='pending' cujo scheduled_at venceu.
// Para cada ação, invoca chat com [RETOMADA_AGENTE_PROPRIA] e atualiza o status.

import { autorizarCron } from "../_shared/auth-cron.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const { ok: authOk } = await autorizarCron(req);
  if (!authOk) return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });

  const supabase = criarClienteAdmin();
  const t0 = Date.now();

  // Buscar ações vencidas pendentes (limite 50 por rodada para evitar timeout)
  const { data: acoes, error } = await supabase
    .from("acoes_agendadas")
    .select("id, conversation_id, tenant_id, carga")
    .eq("action_type", "retomada_agente_propria")
    .eq("status", "pendente")
    .lte("scheduled_at", new Date().toISOString())
    .limit(50);

  if (error) {
    console.warn("[cron-retomar-agente] erro ao buscar ações:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sucessos = 0;
  let falhas = 0;

  for (const acao of acoes ?? []) {
    try {
      // Marcar como em processamento para evitar dupla execução
      await supabase
        .from("acoes_agendadas")
        .update({ status: 'processando' })
        .eq("id", acao.id);

      // Buscar agente_id e phone da conversa via join leads
      const { data: conv } = await supabase
        .from("conversas")
        .select("phone, lead_id, leads(agente_id)")
        .eq("id", acao.conversation_id)
        .maybeSingle();

      const agentId = (conv as { leads?: { agente_id?: string } } | null)
        ?.leads?.agente_id;

      if (!agentId || !conv?.phone) {
        console.warn(
          "[cron-retomar-agente] agente_id ou phone ausente · conversation_id=",
          acao.conversation_id,
        );
        await supabase
          .from("acoes_agendadas")
          .update({ status: 'falhou', error_message: "agente_id ou phone ausente" })
          .eq("id", acao.id);
        falhas++;
        continue;
      }

      // Invocar o motor vivo com marcador especial de retomada
      // (o legado `chat` foi aposentado em 2026-05-12).
      const { error: chatErr } = await supabase.functions.invoke("ragentic-processar-inline", {
        body: {
          message: "[RETOMADA_AGENTE_PROPRIA]",
          agente_id: agentId,
          conversation_id: acao.conversation_id,
          phone: conv.phone,
          metadata: {
            scheduled_action_id: acao.id,
            payload_retomada: acao.carga,
          },
        },
      });

      if (chatErr) {
        console.warn(
          "[cron-retomar-agente] chat falhou · id=",
          acao.id,
          "·",
          chatErr.message,
        );
        await supabase
          .from("acoes_agendadas")
          .update({ status: 'falhou', error_message: chatErr.message })
          .eq("id", acao.id);
        falhas++;
      } else {
        await supabase
          .from("acoes_agendadas")
          .update({
            status: 'executado',
            executed_at: new Date().toISOString(),
          })
          .eq("id", acao.id);
        sucessos++;
      }
    } catch (e) {
      console.warn(
        "[cron-retomar-agente] exceção · id=",
        acao.id,
        "·",
        (e as Error).message,
      );
      await supabase
        .from("acoes_agendadas")
        .update({ status: 'falhou', error_message: (e as Error).message })
        .eq("id", acao.id);
      falhas++;
    }
  }

  const total = acoes?.length ?? 0;
  console.warn(
    `[cron-retomar-agente] concluído · total=${total} sucessos=${sucessos} falhas=${falhas} ms=${Date.now() - t0}`,
  );

  return new Response(
    JSON.stringify({
      ok: true,
      duration_ms: Date.now() - t0,
      total,
      sucessos,
      falhas,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
