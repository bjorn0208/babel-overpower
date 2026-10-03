/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  enfileirarAcaoTemporal,
  jaDisparouRecente,
  type ConversaAtiva,
  type TriggerTemporal,
} from "./enqueue-acao.ts";

// ---------------------------------------------------------------------------
// Sweep de contrato não assinado — dispara follow-up quando um contrato foi
// enviado (created_at registrado) mas signed_at ainda é NULL após
// `tempo_aguardar_minutos` minutos.
//
// Schema contratos (pós Big-Bang PT-BR):
//   id, conversa_id, lead_id, tenant_id, status,
//   assinado_em (null = não assinado), url_comprovante_pagamento (null = sem comprovante),
//   created_at
//
// Proxy de "contrato enviado": contratos.created_at (contrato criado = enviado).
// Condição de disparo: assinado_em IS NULL AND created_at < now() - N minutos.
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;

// Intervalo mínimo (minutos) para sequer buscar contratos sem assinatura.
// Evita falsos positivos imediatamente após envio.
const MIN_CONTRATO_SEM_ASSINAR_MINUTOS = 30;

// F0 (blueprint v3 §4) — safety-net de entrega do link.
// Contrato pendente SEM carimbo link_entregue_em após N minutos = a bolha-do-link
// falhou/nunca entrou na caixa → reenfileira a MESMA chave_publica (link idêntico).
const MIN_LINK_NAO_ENTREGUE_MINUTOS = 10;
const MAX_IDADE_LINK_HORAS = 48; // não ressuscita contrato antigo
const DEDUP_REENVIO_MINUTOS = 30; // 1 tentativa a cada 30min no máximo
// Contrato mora na Babel; o resto dos links mora na Plataforma Limpa. Ver a nota
// completa em `_shared/tools-internas.ts`. Aqui só o link de contrato é montado.
const CONTRATO_PUBLIC_URL = (Deno.env.get("CONTRATO_PUBLIC_URL") ?? "https://www.babel-os.com").replace(/\/+$/, "");

async function reenfileirarLinksNaoEntregues(supabase: SupabaseClient): Promise<number> {
  let reenfileirados = 0;
  const corteMin = new Date(Date.now() - MIN_LINK_NAO_ENTREGUE_MINUTOS * 60_000).toISOString();
  const corteMax = new Date(Date.now() - MAX_IDADE_LINK_HORAS * 3_600_000).toISOString();

  const { data: pendentes } = await supabase
    .from("contratos")
    .select("id, conversa_id, tenant_id, chave_publica")
    .eq("status", "pendente")
    .eq("origem", "agente")
    .is("link_entregue_em", null)
    .not("conversa_id", "is", null)
    .lt("created_at", corteMin)
    .gt("created_at", corteMax)
    .limit(BATCH_SIZE);

  for (const ctr of pendentes ?? []) {
    try {
      // Conversa precisa estar ativa com IA ligada (pausa humana = silêncio total, cravado 2026-05-26).
      const { data: conv } = await supabase
        .from("conversas")
        .select("status, agent_enabled")
        .eq("id", ctr.conversa_id)
        .maybeSingle();
      if (!conv || conv.agent_enabled === false || conv.status === "humano" || conv.status === "encerrada" || conv.status === "closed") continue;

      // Dedup: já existe bolha viva deste contrato, ou tentativa recente? Não duplica.
      const corteDedup = new Date(Date.now() - DEDUP_REENVIO_MINUTOS * 60_000).toISOString();
      const { data: bolhaViva } = await supabase
        .from("caixa_saida_mensagens")
        .select("id, status, created_at")
        .eq("conversation_id", ctr.conversa_id)
        .eq("carga->>contrato_id", ctr.id)
        .or(`status.in.(pendente,processando),created_at.gt.${corteDedup}`)
        .limit(1).maybeSingle();
      if (bolhaViva) continue;

      await supabase.from("caixa_saida_mensagens").insert({
        tenant_id: ctr.tenant_id,
        conversation_id: ctr.conversa_id,
        status: "pendente",
        content: `${CONTRATO_PUBLIC_URL}/contrato/${ctr.chave_publica}`,
        bubble_order: 0,
        scheduled_at: new Date().toISOString(),
        delay_calculado_ms: 0,
        engagement_level: "morno",
        carga: { typing_ms: 0, origem: "contrato_link_sweep", contrato_id: ctr.id, inviolavel: true, gerada_ate: null },
      });
      reenfileirados++;
    } catch (e) {
      console.warn(`[sweep-contrato] safety-net falhou contrato=${ctr.id}:`, (e as Error).message);
    }
  }
  if (reenfileirados > 0) console.log(`[sweep-contrato] safety-net reenfileirou ${reenfileirados} link(s) não entregue(s)`);
  return reenfileirados;
}

export interface SweepContratoResult {
  processados: number;
  disparadas: number;
  erros: number;
}

export async function sweepContrato(
  supabase: SupabaseClient,
): Promise<SweepContratoResult> {
  let processados = 0;
  let disparadas = 0;
  let erros = 0;

  // F0: antes dos gatilhos temporais, garante a ENTREGA do link (safety-net).
  try {
    await reenfileirarLinksNaoEntregues(supabase);
  } catch (e) {
    console.warn("[sweep-contrato] safety-net erro geral:", (e as Error).message);
  }

  const corte = new Date(
    Date.now() - MIN_CONTRATO_SEM_ASSINAR_MINUTOS * 60_000,
  ).toISOString();

  // Busca contratos sem assinatura criados há pelo menos MIN_CONTRATO_SEM_ASSINAR_MINUTOS.
  // conversation_id obrigatório (usamos para enfileirar na caixa_saida_mensagens).
  const { data: contratos, error: fetchErr } = await supabase
    .from("contratos")
    .select("id, conversa_id, lead_id, tenant_id, created_at")
    .is("assinado_em", null)
    .not("conversa_id", "is", null)
    .lt("created_at", corte)
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error(
      "[sweep-contrato] falha ao buscar contratos sem assinatura:",
      fetchErr.message,
    );
    return { processados, disparadas, erros: erros + 1 };
  }

  if (!contratos || contratos.length === 0) {
    return { processados, disparadas, erros };
  }

  for (const contrato of contratos) {
    processados++;

    // Guard: verificar se a conversa ainda está ativa (contrato pode ter sido
    // recusado e conversa fechada sem signed_at preenchido).
    try {
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

      // Tempo sem assinar em minutos (desde criação do contrato).
      const semAssinarMs =
        Date.now() - new Date(contrato.created_at).getTime();
      const semAssinarMin = semAssinarMs / 60_000;

      const { data: triggers, error: rpcErr } = await supabase.rpc(
        "buscar_triggers_temporais",
        {
          p_condicao_tipo: "nao_assinou_contrato",
          p_escopo: "tenant",
          p_nicho_id: nichoId,
          p_tenant_id: contrato.tenant_id,
          p_fase_aplicavel: null,
        },
      );

      if (rpcErr) {
        console.warn(
          `[sweep-contrato] rpc falhou contrato=${contrato.id}:`,
          rpcErr.message,
        );
        erros++;
        continue;
      }

      if (!triggers || triggers.length === 0) continue;

      for (const trigger of triggers as TriggerTemporal[]) {
        if (semAssinarMin < trigger.tempo_aguardar_minutos) continue;

        const jaFez = await jaDisparouRecente(
          supabase,
          convAtiva.id,
          trigger.id,
        );
        if (jaFez) continue;

        await enfileirarAcaoTemporal(supabase, convAtiva, trigger, "nao_assinou_contrato");
        disparadas++;
      }
    } catch (err) {
      console.error(
        `[sweep-contrato] erro inesperado contrato=${contrato.id}:`,
        (err as Error).message,
      );
      erros++;
    }
  }

  return { processados, disparadas, erros };
}
