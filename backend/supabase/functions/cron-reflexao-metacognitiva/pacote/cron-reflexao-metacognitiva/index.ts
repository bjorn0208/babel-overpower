/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
// Cron Reflexão Metacognitiva — semanal (seg 04:00 UTC).
// Agrupa últimos 14 dias de reflection_log por (tenant_id, motivo_falha) e
// pede pro Gemma 27B destilar padrão recorrente em meta_chunk.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { criarClienteAdmin } from "../_shared/supabase.ts";
import { logLLMCost } from "../_shared/log-llm-cost.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const OPENROUTER_BASE_URL = Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";

const MODELO = "google/gemma-3-27b-it";
const JANELA_DIAS = 14;
const MIN_OCORRENCIAS = 4; // grupo precisa de >=4 lições pra valer destilação

type ReflectionRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  motivo_falha: string;
  resposta_original: string;
  licao_gerada: string | null;
  detalhe_verificador: Record<string, unknown> | null;
  criado_em: string;
};

type Grupo = {
  tenant_id: string;
  motivo_falha: string;
  rows: ReflectionRow[];
};

const PROMPT_SYSTEM = `Você é um especialista em meta-cognição de agentes conversacionais.

Sua tarefa: receber um lote de N lições rotuladas com mesmo motivo_falha (de mesmo tenant) e destilar UM padrão recorrente em formato meta_chunk.

Regras:
- Output JSON estrito: { "tag": string, "corpo": string, "citacao_kb": string|null, "tags": string[] }
- "tag": frase curta (até 60 chars) que rotula o padrão (ex: "agente_ignora_pergunta_de_preco_fora_de_contexto").
- "corpo": 2-4 frases descrevendo o padrão + correção. Português acentuado.
- "citacao_kb": string opcional citando reference de bloco existente que poderia prevenir.
- "tags": array de 3-6 tags categorizando.
- Só destila se realmente vir um padrão (não força).

Se as lições não formam padrão coerente, retorna: { "tag": "sem_padrao", "corpo": "Não há padrão recorrente detectável." }.`;

async function destilar(rows: ReflectionRow[]): Promise<{ tag: string; corpo: string; citacao_kb: string | null; tags: string[] } | null> {
  if (!OPENROUTER_API_KEY) return null;
  const userMsg = `Lote de ${rows.length} lições rotuladas como "${rows[0].motivo_falha}":\n\n` +
    rows.map((r, i) => `[${i + 1}] resposta_original: "${(r.resposta_original ?? "").slice(0, 280)}" · licao: "${r.licao_gerada ?? "(sem lição)"}".`).join("\n");

  const t0 = Date.now();
  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Plataforma Limpa · cron-reflexao-metacognitiva",
      },
      body: JSON.stringify({
        model: MODELO,
        messages: [{ role: "system", content: PROMPT_SYSTEM }, { role: "user", content: userMsg }],
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
    });
    const latencia = Date.now() - t0;
    if (!res.ok) {
      console.warn(`[reflexao-meta] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = await res.json();
    const supabase = criarClienteAdmin();
    void logLLMCost(supabase, {
      slug: MODELO,
      tokens_input: json?.usage?.prompt_tokens ?? 0,
      tokens_output: json?.usage?.completion_tokens ?? 0,
      latencia_ms: latencia,
      tipo: "reflexao_metacognitiva",
      status: 'sucesso',
    });
    const raw = json?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { tag?: string; corpo?: string; citacao_kb?: string | null; tags?: string[] };
    if (!parsed.tag || !parsed.corpo || parsed.tag === "sem_padrao") return null;
    return {
      tag: String(parsed.tag).slice(0, 60),
      corpo: String(parsed.corpo).slice(0, 1200),
      citacao_kb: parsed.citacao_kb ? String(parsed.citacao_kb).slice(0, 400) : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8).map((t) => String(t).slice(0, 40)) : [],
    };
  } catch (e) {
    console.warn(`[reflexao-meta] erro destilacao: ${(e as Error).message}`);
    return null;
  }
}

async function processarGrupo(supabase: SupabaseClient, g: Grupo): Promise<{ ok: boolean; meta_bloco_id: string | null; rows_marcadas: number }> {
  const destilado = await destilar(g.rows);
  if (!destilado) return { ok: false, meta_bloco_id: null, rows_marcadas: 0 };

  // INSERT meta_chunk
  const { data: mc, error } = await supabase.from("blocos_meta").insert({
    escopo: "tenant",
    tenant_id: g.tenant_id,
    tag: destilado.tag,
    corpo: destilado.corpo,
    citacao_kb: destilado.citacao_kb,
    tags: [...destilado.tags, "reflexao_metacognitiva", g.motivo_falha],
    origem: "reflexao_metacognitiva",
    ativo: true,
    prioridade: 700,
    stability_tier: "experimental",
  }).select("id").single();
  if (error || !mc) {
    console.warn(`[reflexao-meta] INSERT blocos_meta falhou: ${error?.message}`);
    return { ok: false, meta_bloco_id: null, rows_marcadas: 0 };
  }

  // Marca reflection_log com o meta_bloco_criado_id
  const ids = g.rows.map((r) => r.id);
  const { error: errUpd } = await supabase.from("registro_reflexao").update({ meta_bloco_criado_id: mc.id }).in("id", ids);
  if (errUpd) console.warn(`[reflexao-meta] UPDATE reflection_log: ${errUpd.message}`);

  return { ok: true, meta_bloco_id: mc.id as string, rows_marcadas: ids.length };
}

Deno.serve(async (_req: Request) => {
  const { ok: _cronOk } = await autorizarCron(_req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const supabase = criarClienteAdmin();
  const since = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("registro_reflexao")
    .select("id, tenant_id, conversation_id, motivo_falha, resposta_original, licao_gerada, detalhe_verificador, criado_em")
    .is("deleted_at", null)
    .is("meta_bloco_criado_id", null)
    .gte("criado_em", since)
    .order("criado_em", { ascending: false })
    .limit(2000);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  const rows = (data ?? []) as ReflectionRow[];

  // Agrupa por (tenant_id, motivo_falha)
  const grupos = new Map<string, Grupo>();
  for (const r of rows) {
    if (!r.tenant_id || !r.motivo_falha) continue;
    const k = `${r.tenant_id}::${r.motivo_falha}`;
    const g = grupos.get(k) ?? { tenant_id: r.tenant_id, motivo_falha: r.motivo_falha, rows: [] };
    g.rows.push(r);
    grupos.set(k, g);
  }

  const elegiveis = Array.from(grupos.values()).filter((g) => g.rows.length >= MIN_OCORRENCIAS);

  let metaBlocosCriados = 0;
  let rowsMarcadas = 0;
  for (const g of elegiveis) {
    const r = await processarGrupo(supabase, g);
    if (r.ok) {
      metaBlocosCriados += 1;
      rowsMarcadas += r.rows_marcadas;
    }
  }

  return new Response(
    JSON.stringify({
      janela_dias: JANELA_DIAS,
      total_lições_lidas: rows.length,
      grupos_total: grupos.size,
      grupos_elegiveis: elegiveis.length,
      meta_blocos_criados: metaBlocosCriados,
      rows_marcadas: rowsMarcadas,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
