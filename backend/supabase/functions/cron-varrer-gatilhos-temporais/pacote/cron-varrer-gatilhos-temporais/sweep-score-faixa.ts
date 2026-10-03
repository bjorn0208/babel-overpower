/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  enfileirarAcaoTemporal,
  jaDisparouRecente,
  type ConversaAtiva,
  type TriggerTemporal,
} from "./enqueue-acao.ts";

// ---------------------------------------------------------------------------
// sweep-score-faixa — ITEM 11 "Score por faixa sem gatilho".
//
// O motor grava `conversas.score_lead` a cada turno (ragentic-processar-inline
// :4804-4809) e a faixa é derivada por `calcularEngajamento` (_shared/engajamento
// .ts:29-31): quente≥70 · morno≥40 · frio. O elo que faltava: quando a faixa
// CRUZA, ninguém criava gatilho/ação — `gatilhos_reativos` estava vazia e o cron
// só lia silêncio/contrato/comprovante/despedida.
//
// A migration `aplicar-2026-09-24-gatilho-score-faixa.sql` fecha o início do
// pipeline: trigger DB grava o cruzamento em `gatilhos_score_lead`. Este sweep
// executa o gatilho no "cron certo" (cron-varrer-gatilhos-temporais):
//   - cruza o cruzamento pendente com gatilhos DE SCORE ATIVOS em
//     `gatilhos_reativos` (cenario='score_faixa', acao_carga.faixa_alvo = faixa
//     nova). Sem gatilho ativo o cruzamento é descartado: ativar o gatilho é
//     configuração, não código.
//   - exige conversa ativa + lead + agente ligado + janela de SILÊNCIO útil
//     (não interrompe conversa em andamento) e o tempo de cadência do gatilho.
//   - enfileira `retomada_planejada` pelo MESMO pipeline dos outros sweeps
//     (com compromisso/pausa/cérebro-único/anti-dup → process-followups → motor).
// ---------------------------------------------------------------------------

const BATCH_SIZE = 25;
const MIN_SILENCIO_MINUTOS = 30;
const SILENCIO_MAX_MINUTOS = 3 * 24 * 60; // 3 dias — cruzamento velho é descartado
const CROSSING_MAX_DIAS = 30;

export interface SweepScoreFaixaResult {
  processadas: number;
  disparadas: number;
  erros: number;
}

type ConfigScoreFaixa = {
  id: string;
  tenant_id: string | null;
  nicho_id: string | null;
  acao_tipo: string | null;
  acao_carga: Record<string, unknown> | null;
};

type Cruzamento = {
  id: string;
  conversa_id: string;
  lead_id: string | null;
  tenant_id: string | null;
  score: number;
  faixa_anterior: string | null;
  faixa_nova: string;
};

async function marcarProcessado(
  supabase: SupabaseClient,
  cruzId: string,
): Promise<void> {
  await supabase.from("gatilhos_score_lead")
    .update({ processado_em: new Date().toISOString() })
    .eq("id", cruzId);
}

export async function sweepScoreFaixa(
  supabase: SupabaseClient,
): Promise<SweepScoreFaixaResult> {
  const res: SweepScoreFaixaResult = { processadas: 0, disparadas: 0, erros: 0 };
  const desdeCrossing = new Date(Date.now() - CROSSING_MAX_DIAS * 86_400_000).toISOString();

  // 1) Gatilhos de score ATIVOS (configurados em gatilhos_reativos — a tabela
  // "vazia" que o plano de ITEM 11 apontava). Faixa_alvo decide a aplicação.
  const { data: configs, error: cfgErr } = await supabase
    .from("gatilhos_reativos")
    .select("id, tenant_id, nicho_id, acao_tipo, acao_carga")
    .eq("ativo", true)
    .eq("cenario", "score_faixa")
    .limit(300);

  if (cfgErr) {
    console.error("[sweep-score-faixa] falha ao carregar gatilhos de score:", cfgErr.message);
    return { ...res, erros: res.erros + 1 };
  }

  const configsPorFaixa = new Map<string, ConfigScoreFaixa[]>();
  for (const cfg of (configs ?? []) as ConfigScoreFaixa[]) {
    const faixa = String((cfg.acao_carga as Record<string, unknown> | null)?.faixa_alvo ?? "");
    if (!faixa) continue;
    const lista = configsPorFaixa.get(faixa) ?? [];
    lista.push(cfg);
    configsPorFaixa.set(faixa, lista);
  }
  if (configsPorFaixa.size === 0) return res;

  // 2) Cruzamentos de faixa pendentes (registrados pela trigger DB).
  const { data: cruzamentos, error: crErr } = await supabase
    .from("gatilhos_score_lead")
    .select("id, conversa_id, lead_id, tenant_id, score, faixa_anterior, faixa_nova")
    .is("processado_em", null)
    .gte("criado_em", desdeCrossing)
    .order("criado_em", { ascending: true })
    .limit(BATCH_SIZE);

  if (crErr) {
    console.error("[sweep-score-faixa] falha ao carregar cruzamentos:", crErr.message);
    return { ...res, erros: res.erros + 1 };
  }
  if (!cruzamentos || cruzamentos.length === 0) return res;

  for (const cruz of cruzamentos as Cruzamento[]) {
    res.processadas++;
    try {
      const candidatos = (configsPorFaixa.get(cruz.faixa_nova) ?? [])
        .filter((cfg) => cfg.tenant_id === null || cfg.tenant_id === cruz.tenant_id);

      // Sem gatilho de score para esta faixa/tenant → cruza morre aqui (processa).
      // Ativar depois nao ressuscita cruzamentos antigos — é o comportamento
      // conservador: ativação é config, não carga retroativa.
      if (candidatos.length === 0) {
        await marcarProcessado(supabase, cruz.id);
        continue;
      }

      const { data: conv } = await supabase
        .from("conversas")
        .select("id, tenant_id, lead_id, updated_at, status, agent_enabled")
        .eq("id", cruz.conversa_id)
        .maybeSingle();

      if (
        !conv ||
        conv.status !== "ativa" ||
        conv.agent_enabled === false ||
        !conv.lead_id
      ) {
        await marcarProcessado(supabase, cruz.id);
        continue;
      }

      const silencioMin = (Date.now() - new Date(conv.updated_at as string).getTime()) / 60_000;
      // Conversa muito fresca → não interrompe; deixa pendente pra próxima volta.
      // Cruzamento velho demais (≥3d de silêncio) → descarta.
      if (silencioMin < MIN_SILENCIO_MINUTOS) continue;
      if (silencioMin > SILENCIO_MAX_MINUTOS) {
        await marcarProcessado(supabase, cruz.id);
        continue;
      }

      const convAtiva: ConversaAtiva = {
        id: conv.id,
        tenant_id: conv.tenant_id,
        lead_id: conv.lead_id,
        updated_at: conv.updated_at,
      };

      // Prioridade: gatilho tenant-específico > global.
      const ordenados = [...candidatos].sort(
        (a, b) => Number(!!b.tenant_id) - Number(!!a.tenant_id),
      );

      let atuado = false;
      for (const cfg of ordenados) {
        const carga = (cfg.acao_carga ?? {}) as Record<string, unknown>;
        const tempo = Math.max(
          MIN_SILENCIO_MINUTOS,
          Number(carga.tempo_aguardar_minutos ?? MIN_SILENCIO_MINUTOS) || MIN_SILENCIO_MINUTOS,
        );
        if (silencioMin < tempo) continue; // ainda não bateu a cadência → deixa pendente

        const trigger: TriggerTemporal = {
          id: cfg.id,
          nome_trigger: cfg.acao_tipo ?? "score_faixa",
          tempo_aguardar_minutos: tempo,
          acao_disparada: cfg.acao_tipo ?? "retomada_planejada",
          acao_payload: {
            ...carga,
            faixa_anterior: cruz.faixa_anterior,
            faixa_nova: cruz.faixa_nova,
            score: cruz.score,
          },
          fase_aplicavel: null,
        };

        const jaFez = await jaDisparouRecente(supabase, convAtiva.id, trigger.id);
        if (jaFez) {
          atuado = true; // já existe ação para este gatilho na janela de dedup
          continue;
        }

        await enfileirarAcaoTemporal(supabase, convAtiva, trigger, "score_faixa", {
          nivelMinimo: "qualquer",
        });
        res.disparadas++;
        atuado = true;
      }

      if (atuado) await marcarProcessado(supabase, cruz.id);
      // Sem atuado = cadência ainda não atingida → pendente, volta a tentar.
    } catch (err) {
      console.error(`[sweep-score-faixa] erro inesperado cruz=${cruz.id}:`, (err as Error).message);
      res.erros++;
    }
  }

  return res;
}