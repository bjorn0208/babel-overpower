/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { carregarFiltrosCronjob } from "./enqueue-acao.ts";

// ---------------------------------------------------------------------------
// sweep-despedida — DEC-017 · 4ª automação.
//
// Detecta conversas onde o lead se despediu sem acordo de data de retorno
// (Gemma sinaliza no campo `despedida_sem_data` do JSON · post-llm.ts grava em
// conversations.despedida_sem_data_at).
//
// Para cada conversa elegível:
//   - aplica filtros de curadoria (engajamento mínimo, exclusões)
//   - verifica que NÃO tem compromisso ativo (DEC-014)
//   - cria scheduled_action(action_type='planejar_retomada',
//                            payload.condicao_tipo='despedida_sem_data')
//   - LLM (Gemma+Flash) decide depois quando+ângulo+assunto consumindo blocos
//     de Automação Semântica (categoria estrategia_retomada/despedida).
//
// Janela mínima de espera: 6h após despedida (não enche o saco do lead que
// acabou de sair). Configurável via cronjobs_config.parametros.filtros futuro.
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50;
const MIN_HORAS_APOS_DESPEDIDA = 6;
const NIVEL_RANK: Record<string, number> = { frio: 0, morno: 1, quente: 2 };

export interface SweepDespedidaResult {
  processadas: number;
  disparadas: number;
  erros: number;
}

export async function sweepDespedida(
  supabase: SupabaseClient,
): Promise<SweepDespedidaResult> {
  let processadas = 0;
  let disparadas = 0;
  let erros = 0;

  const corte = new Date(
    Date.now() - MIN_HORAS_APOS_DESPEDIDA * 60 * 60_000,
  ).toISOString();

  const { data: conversas, error: fetchErr } = await supabase
    .from("conversas")
    .select("id, tenant_id, lead_id, despedida_sem_data_at")
    .eq("status", "ativa")
    .eq("agent_enabled", true)
    .not("lead_id", "is", null)
    .not("despedida_sem_data_at", "is", null)
    .lt("despedida_sem_data_at", corte)
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error("[sweep-despedida] falha ao buscar conversas:", fetchErr.message);
    return { processadas, disparadas, erros: erros + 1 };
  }

  if (!conversas || conversas.length === 0) {
    return { processadas, disparadas, erros };
  }

  const filtros = await carregarFiltrosCronjob(supabase);
  const minRank = NIVEL_RANK[filtros.nivel_engajamento_minimo] ?? 1;

  for (const conv of conversas as Array<{ id: string; tenant_id: string; lead_id: string }>) {
    processadas++;

    try {
      // DEC-014 prioridade compromisso
      const { data: temCompromisso } = await supabase.rpc("existe_compromisso_ativo", {
        p_conversation_id: conv.id,
      });
      if (temCompromisso === true) continue;

      // Dedup · não cria 2 planejar_retomada de despedida em janela de 24h
      const corte24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const { data: jaCriado } = await supabase
        .from("acoes_agendadas")
        .select("id")
        .eq("conversation_id", conv.id)
        .eq("action_type", "planejar_retomada")
        .filter("carga->>condicao_tipo", "eq", "despedida_sem_data")
        .gte("created_at", corte24h)
        .limit(1)
        .maybeSingle();
      if (jaCriado) continue;

      // Filtro · fase_pipeline do lead (chave canônica fase_pipeline_in com fallback pipeline_stage_in)
      const fasesExcl = filtros.excluir_se.fase_pipeline_in ?? filtros.excluir_se.pipeline_stage_in;
      if (fasesExcl?.length) {
        const { data: leadRow } = await supabase
          .from("leads")
          .select("fase_pipeline")
          .eq("id", conv.lead_id)
          .maybeSingle();
        const stage = leadRow?.fase_pipeline as string | undefined;
        if (stage && fasesExcl.includes(stage)) continue;
      }

      // Filtro · engagement nivel mínimo
      if (minRank > 0) {
        const { data: eng } = await supabase
          .from("engajamento_lead")
          .select("nivel")
          .eq("lead_id", conv.lead_id)
          .maybeSingle();
        const nivelRank = NIVEL_RANK[eng?.nivel ?? "frio"] ?? 0;
        if (nivelRank < minRank) continue;
      }

      // Filtro · pausa ativa
      if (filtros.excluir_se.tem_pausa_ativa) {
        const { data: pausa } = await supabase
          .from("pausa_conversa")
          .select("id")
          .eq("conversation_id", conv.id)
          .gt("reativar_em", new Date().toISOString())
          .limit(1)
          .maybeSingle();
        if (pausa) continue;
      }

      // Busca agent_id ativo do tenant
      const { data: ag } = await supabase
        .from("agentes_usuario")
        .select("id")
        .eq("user_id", conv.tenant_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      // Fix 2026-05-11 · UPSERT idempotente via RPC central
      // `enfileirar_acao_agendada`. Mantém o dedup app-side acima (janela 24h
      // por condicao_tipo) e adiciona a garantia banco-side (UNIQUE em
      // conversation_id, action_type, scheduled_at em status pendente/processando).
      const { error } = await supabase.rpc("enfileirar_acao_agendada", {
        p_conversation_id: conv.id,
        p_lead_id: conv.lead_id,
        p_agente_id: ag?.id ?? null,
        p_tenant_id: conv.tenant_id,
        p_action_type: "planejar_retomada",
        p_scheduled_at: new Date().toISOString(),
        p_carga: {
          origem: "sweep_despedida",
          condicao_tipo: "despedida_sem_data",
          tom: "respeitoso_paciente",
          tentativa: 1,
        },
      });

      if (error) {
        console.error("[sweep-despedida] falha INSERT scheduled_action:", error.message);
        erros++;
        continue;
      }
      disparadas++;
    } catch (err) {
      console.error("[sweep-despedida] erro inesperado conv=" + conv.id + ":", (err as Error).message);
      erros++;
    }
  }

  return { processadas, disparadas, erros };
}
