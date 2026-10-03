/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  enfileirarAcaoTemporal,
  jaDisparouRecente,
  type ConversaAtiva,
  type TriggerTemporal,
} from "./enqueue-acao.ts";

// ---------------------------------------------------------------------------
// Sweep de comprovante não enviado — dispara follow-up quando um contrato foi
// assinado (assinado_em NOT NULL) mas o comprovante de pagamento ainda não foi
// enviado (url_comprovante_pagamento IS NULL) após `tempo_aguardar_minutos` minutos.
//
// Schema contratos (pós Big-Bang PT-BR):
//   id, conversa_id, lead_id, tenant_id, status,
//   assinado_em (not null = assinado), url_comprovante_pagamento (null = sem comprovante),
//   created_at
//
// Proxy de "contrato assinado sem comprovante":
//   assinado_em IS NOT NULL AND url_comprovante_pagamento IS NULL
//   AND assinado_em < now() - N minutos
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;

// Intervalo mínimo (minutos) após assinatura para buscar sem comprovante.
const MIN_SEM_COMPROVANTE_MINUTOS = 30;

export interface SweepComprovanteResult {
  processados: number;
  disparadas: number;
  erros: number;
}

export async function sweepComprovante(
  supabase: SupabaseClient,
): Promise<SweepComprovanteResult> {
  let processados = 0;
  let disparadas = 0;
  let erros = 0;

  const corte = new Date(
    Date.now() - MIN_SEM_COMPROVANTE_MINUTOS * 60_000,
  ).toISOString();

  // Contratos assinados mas sem comprovante de pagamento,
  // cujo signed_at passou do corte.
  const { data: contratos, error: fetchErr } = await supabase
    .from("contratos")
    .select("id, conversa_id, lead_id, tenant_id, assinado_em")
    .not("assinado_em", "is", null)
    .is("url_comprovante_pagamento", null)
    .not("conversa_id", "is", null)
    .lt("assinado_em", corte)
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error(
      "[sweep-comprovante] falha ao buscar contratos sem comprovante:",
      fetchErr.message,
    );
    return { processados, disparadas, erros: erros + 1 };
  }

  if (!contratos || contratos.length === 0) {
    return { processados, disparadas, erros };
  }

  for (const contrato of contratos) {
    processados++;

    try {
      // Guard: conversa ainda ativa (lead pode ter sumido e conversa fechada).
      const { data: conv } = await supabase
        .from("conversas")
        .select("id, tenant_id, lead_id, updated_at, status, agent_enabled")
        .eq("id", contrato.conversa_id)
        .maybeSingle();

      if (
        !conv ||
        (conv.status === 'closed' || conv.status === 'encerrada') ||
        conv.agent_enabled === false
      ) {
        continue;
      }

      const convAtiva: ConversaAtiva = {
        id: conv.id,
        tenant_id: conv.tenant_id,
        lead_id: conv.lead_id,
        updated_at: conv.updated_at,
      };

      // Busca nicho_id do tenant.
      const { data: perfil } = await supabase
        .from("profiles")
        .select("nicho_id")
        .eq("id", contrato.tenant_id)
        .maybeSingle();

      const nichoId: string | null = perfil?.nicho_id ?? null;

      // Tempo sem comprovante em minutos (desde assinatura).
      const semComprovanteMs =
        Date.now() - new Date(contrato.assinado_em as string).getTime();
      const semComprovanteMin = semComprovanteMs / 60_000;

      const { data: triggers, error: rpcErr } = await supabase.rpc(
        "buscar_triggers_temporais",
        {
          p_condicao_tipo: "nao_enviou_comprovante",
          p_escopo: "tenant",
          p_nicho_id: nichoId,
          p_tenant_id: contrato.tenant_id,
          p_fase_aplicavel: null,
        },
      );

      if (rpcErr) {
        console.warn(
          `[sweep-comprovante] rpc falhou contrato=${contrato.id}:`,
          rpcErr.message,
        );
        erros++;
        continue;
      }

      if (!triggers || triggers.length === 0) continue;

      for (const trigger of triggers as TriggerTemporal[]) {
        if (semComprovanteMin < trigger.tempo_aguardar_minutos) continue;

        const jaFez = await jaDisparouRecente(
          supabase,
          convAtiva.id,
          trigger.id,
        );
        if (jaFez) continue;

        await enfileirarAcaoTemporal(supabase, convAtiva, trigger, "nao_enviou_comprovante");
        disparadas++;
      }
    } catch (err) {
      console.error(
        `[sweep-comprovante] erro inesperado contrato=${contrato.id}:`,
        (err as Error).message,
      );
      erros++;
    }
  }

  return { processados, disparadas, erros };
}
