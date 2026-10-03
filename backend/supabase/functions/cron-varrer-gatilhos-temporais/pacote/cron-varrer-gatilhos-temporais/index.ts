/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { corsHeaders } from "../_shared/cors.ts";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { sweepSilencio } from "./sweep-silencio.ts";
import { sweepContrato } from "./sweep-contrato.ts";
import { sweepComprovante } from "./sweep-comprovante.ts";
import { sweepDespedida } from "./sweep-despedida.ts";
import { sweepScoreFaixa } from "./sweep-score-faixa.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

// ---------------------------------------------------------------------------
// cron-sweep-triggers-temporais
//
// Worker agendado via pg_cron (a cada 5 min) que varre conversas e contratos
// em busca de condições temporais configuradas em blocos_gatilho:
//   - silencio_pos_fase / nao_respondeu_proposta  → sweepSilencio
//   - nao_assinou_contrato                         → sweepContrato
//   - nao_enviou_comprovante                       → sweepComprovante
//
// Cada sweep enfileira mensagens na caixa_saida_mensagens (fire-and-forget).
// O process-followups despacha via Z-API na próxima execução.
//
// verify_jwt: false — invocado por pg_cron com service_role bearer token.
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const inicio = Date.now();

  try {
    const supabase = criarClienteAdmin();

    // Executa os 5 sweeps em paralelo — falha isolada não cancela os demais.
    const [rSilencio, rContrato, rComprovante, rDespedida, rScoreFaixa] = await Promise.allSettled([
      sweepSilencio(supabase),
      sweepContrato(supabase),
      sweepComprovante(supabase),
      sweepDespedida(supabase),
      sweepScoreFaixa(supabase),
    ]);

    const resumo = {
      silencio:
        rSilencio.status === "fulfilled"
          ? rSilencio.value
          : { erro: String((rSilencio as PromiseRejectedResult).reason) },
      contrato:
        rContrato.status === "fulfilled"
          ? rContrato.value
          : { erro: String((rContrato as PromiseRejectedResult).reason) },
      comprovante:
        rComprovante.status === "fulfilled"
          ? rComprovante.value
          : { erro: String((rComprovante as PromiseRejectedResult).reason) },
      despedida:
        rDespedida.status === "fulfilled"
          ? rDespedida.value
          : { erro: String((rDespedida as PromiseRejectedResult).reason) },
      score_faixa:
        rScoreFaixa.status === "fulfilled"
          ? rScoreFaixa.value
          : { erro: String((rScoreFaixa as PromiseRejectedResult).reason) },
    };

    const totalDisparadas =
      (rSilencio.status === "fulfilled" ? rSilencio.value.disparadas : 0) +
      (rContrato.status === "fulfilled" ? rContrato.value.disparadas : 0) +
      (rComprovante.status === "fulfilled" ? rComprovante.value.disparadas : 0) +
      (rDespedida.status === "fulfilled" ? rDespedida.value.disparadas : 0) +
      (rScoreFaixa.status === "fulfilled" ? rScoreFaixa.value.disparadas : 0);

    const duracaoMs = Date.now() - inicio;

    if (totalDisparadas > 0 || duracaoMs > 4000) {
      console.warn(
        `[sweep-triggers-temporais] concluído em ${duracaoMs}ms — disparadas=${totalDisparadas}`,
        JSON.stringify(resumo),
      );
    }

    return new Response(
      JSON.stringify({ ok: true, duracaoMs, sweeps: resumo }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    console.error("[sweep-triggers-temporais] falha fatal:", (err as Error).message);
    return new Response(
      JSON.stringify({ ok: false, erro: (err as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
