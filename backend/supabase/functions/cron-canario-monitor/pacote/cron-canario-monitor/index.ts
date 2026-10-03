/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// cron-canary-monitor · Fase B Curadoria.
//
// Para cada canary_rollouts com status='ativo', calcula métricas em tempo
// real (taxa de resposta lead, taxa de conversão) por variante via JOIN
// com canary_assignments + messages + leads. Avalia critérios de promoção
// e rollback cravados no rollout. Atualiza status quando bate critério.
//
// Auto-promote desligado por padrão · cron só sugere status='pendente_promocao'
// caso `criterios_promocao.auto_promove !== true`. Operador aprova manualmente
// via UI (LabCanary). Auto-rollback é executado direto se atinge critério
// (proteção contra mudança ruim em prod).
//
// Schedule: cron 1h via pg_cron.

import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

type Rollout = {
  id: string;
  titulo: string;
  tenant_id: string | null;
  pct_trafego: number;
  criterios_promocao: Record<string, unknown>;
  criterios_rollback: Record<string, unknown>;
  iniciado_em: string | null;
};

type Metricas = {
  amostras_total: number;
  amostras_a: number;
  amostras_b: number;
  taxa_resposta_a: number;
  taxa_resposta_b: number;
  delta_resposta: number;
  delta_dias: number;
};

async function calcularMetricas(supabase: SupabaseClient, rollout: Rollout): Promise<Metricas> {
  const inicio = rollout.iniciado_em ? new Date(rollout.iniciado_em) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const inicioIso = inicio.toISOString();
  const agora = new Date();
  const deltaDias = (agora.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24);

  const { data: assigns } = await supabase
    .from("atribuicoes_canario")
    .select("variante, conversation_id")
    .eq("canary_id", rollout.id)
    .gte("atribuido_em", inicioIso);

  const lista = (assigns ?? []) as { variante: string; conversation_id: string }[];
  const conversasA = lista.filter((a) => a.variante === "A" || a.variante === "controle").map((a) => a.conversation_id);
  const conversasB = lista.filter((a) => a.variante === "B" || a.variante === "tratamento").map((a) => a.conversation_id);

  const taxaResposta = async (conversationIds: string[]): Promise<number> => {
    if (conversationIds.length === 0) return 0;
    const { count } = await supabase
      .from("mensagens")
      .select("conversation_id", { count: "exact", head: true })
      .in("conversation_id", conversationIds)
      .eq("role", "user")
      .gte("created_at", inicioIso);
    const respondidas = new Set<string>();
    if ((count ?? 0) > 0) {
      const { data: distintas } = await supabase
        .from("mensagens")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .eq("role", "user")
        .gte("created_at", inicioIso)
        .limit(1000);
      ((distintas ?? []) as { conversation_id: string }[]).forEach((m) => respondidas.add(m.conversation_id));
    }
    return conversationIds.length > 0 ? respondidas.size / conversationIds.length : 0;
  };

  const taxaRespostaA = await taxaResposta(conversasA);
  const taxaRespostaB = await taxaResposta(conversasB);

  return {
    amostras_total: lista.length,
    amostras_a: conversasA.length,
    amostras_b: conversasB.length,
    taxa_resposta_a: taxaRespostaA,
    taxa_resposta_b: taxaRespostaB,
    delta_resposta: taxaRespostaB - taxaRespostaA,
    delta_dias: deltaDias,
  };
}

function avaliarPromocao(metricas: Metricas, criterios: Record<string, unknown>): { atinge: boolean; razao: string } {
  const minAmostras = Number(criterios.min_amostras ?? 200);
  const deltaMin = Number(criterios.delta_min ?? 0.05);
  const minDias = Number(criterios.min_dias ?? 3);

  if (metricas.amostras_total < minAmostras) {
    return { atinge: false, razao: `amostras_total < min_amostras (${metricas.amostras_total} < ${minAmostras})` };
  }
  if (metricas.delta_dias < minDias) {
    return { atinge: false, razao: `delta_dias < min_dias (${metricas.delta_dias.toFixed(1)} < ${minDias})` };
  }
  if (metricas.delta_resposta < deltaMin) {
    return { atinge: false, razao: `delta_resposta < delta_min (${metricas.delta_resposta.toFixed(3)} < ${deltaMin})` };
  }
  return { atinge: true, razao: `delta_resposta=${metricas.delta_resposta.toFixed(3)} ≥ ${deltaMin} com ${metricas.amostras_total} amostras` };
}

function avaliarRollback(metricas: Metricas, criterios: Record<string, unknown>): { atinge: boolean; razao: string } {
  const deltaMaxNeg = Number(criterios.delta_max ?? 0.05);
  const minAmostras = Number(criterios.min_amostras ?? 50);

  if (metricas.amostras_total < minAmostras) {
    return { atinge: false, razao: `amostras_total < min_amostras (${metricas.amostras_total} < ${minAmostras})` };
  }
  if (metricas.delta_resposta < -deltaMaxNeg) {
    return {
      atinge: true,
      razao: `delta_resposta=${metricas.delta_resposta.toFixed(3)} pior que -${deltaMaxNeg}`,
    };
  }
  return { atinge: false, razao: "dentro do limite" };
}

Deno.serve(async (req: Request) => {
  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const supabase = criarClienteAdmin();
  const inicio = Date.now();

  const { data: ativos, error } = await supabase
    .from("rollouts_canario")
    .select("id, titulo, tenant_id, pct_trafego, criterios_promocao, criterios_rollback, iniciado_em")
    .eq("status", "ativo")
    .is("deleted_at", null);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const lista = (ativos ?? []) as Rollout[];
  const logs: Record<string, unknown>[] = [];

  for (const r of lista) {
    try {
      const metricas = await calcularMetricas(supabase, r);
      const promo = avaliarPromocao(metricas, r.criterios_promocao ?? {});
      const rollback = avaliarRollback(metricas, r.criterios_rollback ?? {});

      const autoPromove = (r.criterios_promocao as { auto_promove?: boolean })?.auto_promove === true;

      let acao: "nenhuma" | "promovido" | "pendente_promocao" | "rollback" = "nenhuma";
      if (rollback.atinge) {
        acao = "rollback";
        await supabase
          .from("rollouts_canario")
          .update({
            status: "rollback",
            finalizado_em: new Date().toISOString(),
            mudancas: {
              ...(((r as unknown) as { mudancas?: Record<string, unknown> }).mudancas ?? {}),
              motivo_rollback: rollback.razao,
              metricas_finais: metricas,
            },
          })
          .eq("id", r.id);
      } else if (promo.atinge) {
        if (autoPromove) {
          acao = "promovido";
          await supabase
            .from("rollouts_canario")
            .update({
              status: "promovido",
              finalizado_em: new Date().toISOString(),
              mudancas: {
                ...(((r as unknown) as { mudancas?: Record<string, unknown> }).mudancas ?? {}),
                motivo_promocao: promo.razao,
                metricas_finais: metricas,
              },
            })
            .eq("id", r.id);
        } else {
          acao = "pendente_promocao";
          await supabase
            .from("rollouts_canario")
            .update({
              status: "pendente_promocao",
              mudancas: {
                ...(((r as unknown) as { mudancas?: Record<string, unknown> }).mudancas ?? {}),
                motivo_promocao_sugerida: promo.razao,
                metricas_atuais: metricas,
              },
            })
            .eq("id", r.id);
        }
      }

      logs.push({
        rollout_id: r.id,
        titulo: r.titulo,
        metricas,
        promocao: promo,
        rollback,
        acao,
      });
    } catch (e) {
      logs.push({ rollout_id: r.id, error: (e as Error).message });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, duracao_ms: Date.now() - inicio, total: lista.length, logs }),
    { headers: { "Content-Type": "application/json" } },
  );
});
