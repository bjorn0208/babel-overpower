/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// executor-padrao · Fase B Curadoria.
//
// Dispara cenários golden contra o chat real (modo simulator) e compara
// resposta com resultado_esperado. Salva resultado em golden_runs.
//
// Recebe:
//   { golden_chunk_ids?: string[], tenant_id?: string, batch_size?: number }
//
// Quando golden_chunk_ids vazio · roda todos os ativos do escopo (limit batch_size).
// verify_jwt = true · chamado pela UI da Curadoria com JWT do operador.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_BATCH = 20;

type Mensagem = { role: string; content: string };
type BlocoPadrao = {
  id: string;
  titulo: string;
  intent: string | null;
  tags: string[];
  mensagens: Mensagem[];
  resultado_esperado: Record<string, unknown>;
  tenant_id: string | null;
  nicho_id: string | null;
};

type Comparacao = {
  passou: boolean;
  is_regression: boolean;
  diff: Record<string, unknown>;
};

function getCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "3600",
  };
}

async function dispararCenario(
  supabase: SupabaseClient,
  cenario: BlocoPadrao,
): Promise<{ resposta_final: string; obtido: Record<string, unknown>; duracao_ms: number; erro: string | null }> {
  if (!cenario.tenant_id) {
    return { resposta_final: "", obtido: {}, duracao_ms: 0, erro: "tenant_id ausente no cenário" };
  }
  const phone = `sim:golden:${cenario.id.slice(0, 8)}`;
  const t0 = Date.now();
  let respostaFinal = "";
  const respostas: string[] = [];

  // O motor vivo (ragentic-processar-inline) resolve o tenant pelo agente_id.
  // O cenário só tem tenant_id, então pegamos um agente desse tenant.
  const { data: agenteSim } = await supabase
    .from("agentes_usuario")
    .select("id")
    .eq("user_id", cenario.tenant_id)
    .limit(1)
    .maybeSingle();
  const agenteIdSim = (agenteSim as { id?: string } | null)?.id;
  if (!agenteIdSim) {
    return { resposta_final: "", obtido: {}, duracao_ms: 0, erro: "nenhum agente para o tenant do cenário" };
  }

  const turnosLead = (cenario.mensagens ?? []).filter((m) => {
    const role = (m.role ?? "").toLowerCase();
    return role === "user" || role === "lead";
  });

  for (const turno of turnosLead) {
    try {
      const { data, error } = await supabase.functions.invoke("ragentic-processar-inline", {
        body: {
          tenant_id: cenario.tenant_id,
          agente_id: agenteIdSim,
          phone,
          message: turno.content,
          channel: "sim",
          metadata: { simulator: true, source: "executor-padrao", golden_chunk_id: cenario.id },
        },
      });
      if (error) {
        return { resposta_final: "", obtido: {}, duracao_ms: Date.now() - t0, erro: error.message };
      }
      const r = extrairResposta(data);
      if (r) {
        respostas.push(r);
        respostaFinal = r;
      }
    } catch (e) {
      return { resposta_final: "", obtido: {}, duracao_ms: Date.now() - t0, erro: (e as Error).message };
    }
  }

  return {
    resposta_final: respostaFinal,
    obtido: {
      resposta_final: respostaFinal,
      respostas_por_turno: respostas,
    },
    duracao_ms: Date.now() - t0,
    erro: null,
  };
}

function extrairResposta(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  if (typeof d.message === "string") return d.message;
  if (typeof d.response === "string") return d.response;
  if (typeof d.reply === "string") return d.reply;
  if (Array.isArray(d.bolhas)) {
    return (d.bolhas as { content?: string }[]).map((b) => b.content ?? "").join("\n\n");
  }
  return "";
}

function comparar(esperado: Record<string, unknown>, obtido: Record<string, unknown>): Comparacao {
  const diff: Record<string, unknown> = {};
  let acertou = 0;
  let total = 0;

  if (esperado.resposta_contem) {
    total += 1;
    const trecho = String(esperado.resposta_contem).toLowerCase();
    const resp = String(obtido.resposta_final ?? "").toLowerCase();
    const ok = resp.includes(trecho);
    if (ok) acertou += 1;
    else diff.resposta_contem = { esperado: trecho, obtido_amostra: resp.slice(0, 200) };
  }

  if (esperado.resposta_nao_contem) {
    total += 1;
    const trecho = String(esperado.resposta_nao_contem).toLowerCase();
    const resp = String(obtido.resposta_final ?? "").toLowerCase();
    const ok = !resp.includes(trecho);
    if (ok) acertou += 1;
    else diff.resposta_nao_contem = { proibido: trecho, obtido_amostra: resp.slice(0, 200) };
  }

  if (esperado.intent_alvo) {
    total += 1;
    diff.intent_alvo = { esperado: esperado.intent_alvo, validador: "manual" };
  }
  if (esperado.fase_alvo) {
    total += 1;
    diff.fase_alvo = { esperado: esperado.fase_alvo, validador: "manual" };
  }

  const passou = total > 0 ? acertou === total : true;
  return { passou, is_regression: !passou, diff };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // verify_jwt=true (Supabase já exige JWT do operador da Curadoria). NÃO usar o
  // guard de cron aqui — ele só aceita service_role e barraria o operador.
  let body: { golden_chunk_ids?: string[]; tenant_id?: string; batch_size?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const batchSize = Math.min(Math.max(body.batch_size ?? MAX_BATCH, 1), MAX_BATCH);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  // TODO auditoria: exigir tenant_id no body e escopar o batch por tenant
  let q = supabase
    .from("blocos_padrao")
    .select("id, titulo, intent, tags, mensagens, resultado_esperado, tenant_id, nicho_id")
    .eq("ativo", true)
    .is("deleted_at", null)
    .limit(batchSize);
  if (body.golden_chunk_ids && body.golden_chunk_ids.length > 0) {
    q = q.in("id", body.golden_chunk_ids);
  } else if (body.tenant_id) {
    q = q.eq("tenant_id", body.tenant_id);
  }
  const { data: cenarios, error: errCen } = await q;
  if (errCen) {
    return new Response(JSON.stringify({ error: errCen.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const lista = (cenarios ?? []) as BlocoPadrao[];
  if (lista.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, batch_id: null, total: 0, passou: 0, falhou: 0, runs: [] }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const batchId = crypto.randomUUID();
  const inicio = Date.now();
  let passou = 0;
  let falhou = 0;
  const runs: { id: string; cenario_id: string; passou: boolean }[] = [];

  for (const cenario of lista) {
    const exec = await dispararCenario(supabase, cenario);
    const cmp = exec.erro
      ? { passou: false, is_regression: true, diff: { erro: exec.erro } }
      : comparar(cenario.resultado_esperado ?? {}, exec.obtido);
    if (cmp.passou) passou += 1;
    else falhou += 1;

    const { data: runRow } = await supabase
      .from("execucoes_padrao")
      .insert({
        batch_id: batchId,
        cenario_id: cenario.id,
        passou: cmp.passou,
        is_regression: cmp.is_regression,
        diff: cmp.diff,
        obtido: exec.obtido,
        esperado: cenario.resultado_esperado ?? {},
        custo_brl: 0,
        duracao_ms: exec.duracao_ms,
        modelo: "chat-real",
        erro: exec.erro,
      })
      .select("id, cenario_id, passou")
      .single();
    if (runRow) runs.push(runRow as { id: string; cenario_id: string; passou: boolean });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      batch_id: batchId,
      total: lista.length,
      passou,
      falhou,
      duracao_total_ms: Date.now() - inicio,
      runs,
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
