/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { logLLMCost } from "../_shared/log-llm-cost.ts";
import { normalizarCategoriaMemoria } from "./categoria.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

// cron-destilar-memoria
// Lê memórias de curto prazo (lead_memory.escopo='curto') das últimas N horas
// agrupadas por lead, manda Gemma destilar, promove fatos consolidáveis pra
// memória de longo prazo (escopo='longo'), marca curtos como destilados.
//
// Trigger: cronjobs_config row 'destilar-memoria-curto-pra-longo' (modo
// horario, schedule diário 06:00 UTC = 03:00 BRT). Pode rodar manualmente
// via "Rodar agora" no painel Cronjobs.

const MODEL = "google/gemma-3-27b-it";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
  });
}

function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function getOpenRouterKey(supabase: SupabaseClient): Promise<string> {
  const env = Deno.env.get("OPENROUTER_API_KEY");
  if (env) return env;
  const { data } = await supabase
    .from("provedores_llm")
    .select("api_key")
    .eq("slug", "openrouter")
    .eq("is_active", true)
    .maybeSingle();
  return (data?.api_key as string | undefined) ?? "";
}

type FatoLongo = {
  fato: string;
  categoria?: string;
  relevancia?: "alta" | "media" | "baixa";
  confianca?: number;
  valido_desde?: string | null;
};

const PROMPT_SYSTEM = `Você analisa um lote de memórias de CURTO PRAZO de um único contato (lead) extraídas das últimas 24h. Sua tarefa é destilar fatos CONSOLIDÁVEIS — informações estáveis sobre o contato que devem virar memória de LONGO PRAZO permanente.

Critérios de fato consolidável:
- Identifica algo sobre o contato (cidade, profissão, renda, dependentes, preferências, dor, objetivo)
- Não é volátil (não é "tá com pressa hoje" — isso é curto)
- Aparece de forma consistente nas memórias (não é hipótese isolada)
- É útil pro agente lembrar em futuras conversas, em qualquer módulo

Devolva UM ÚNICO JSON {"fatos":[...]} com no máximo 8 fatos. Cada fato:
- fato (string, 1 frase curta direta): ex "Mora em São Paulo desde abril de 2026"
- categoria (uma de: fato_biografico | fato_financeiro | objecao | interesse | historico_negociacao)
- relevancia (alta|media|baixa, default media)
- confianca (float 0.5-1.0, default 0.8): quão certo você está
- valido_desde (ISO date opcional): desde quando esse fato é verdade no mundo real (se mencionado)

Se nada se consolida, devolva {"fatos": []}. Não invente.`;

async function callLLM(
  supabase: SupabaseClient,
  userPrompt: string,
): Promise<{ ok: boolean; text: string; motivo?: string; tokens_in: number; tokens_out: number; latencia_ms: number }> {
  const apiKey = await getOpenRouterKey(supabase);
  if (!apiKey) return { ok: false, text: "", motivo: "openrouter_key_indisponivel", tokens_in: 0, tokens_out: 0, latencia_ms: 0 };
  const t0 = Date.now();
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://plataforma-limpa.com",
        "X-Title": "cron-destilar-memoria",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: PROMPT_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });
    const latencia_ms = Date.now() - t0;
    if (!r.ok) return { ok: false, text: "", motivo: `openrouter ${r.status}: ${(await r.text()).slice(0, 300)}`, tokens_in: 0, tokens_out: 0, latencia_ms };
    const data = await r.json();
    const tokens_in = Number(data?.usage?.prompt_tokens ?? 0);
    const tokens_out = Number(data?.usage?.completion_tokens ?? 0);
    return { ok: true, text: data?.choices?.[0]?.message?.content ?? "", tokens_in, tokens_out, latencia_ms };
  } catch (e) {
    return { ok: false, text: "", motivo: `exception: ${(e as Error).message}`, tokens_in: 0, tokens_out: 0, latencia_ms: Date.now() - t0 };
  }
}

function parseJson(text: string): { fatos?: FatoLongo[] } | null {
  try { return JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
}

type CurtoRow = { id: string; lead_id: string; tenant_id: string; fato: string; modulo: string | null; criado_em: string; valencia_emocional?: number | null };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders() });

  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const janelaHoras = Math.min(72, Math.max(1, parseInt(url.searchParams.get("janela_horas") ?? "24", 10)));
  const minCurtosPorLead = Math.max(1, parseInt(url.searchParams.get("min_curtos_por_lead") ?? "3", 10));
  const limiteLeads = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limite_leads") ?? "200", 10)));

  const supabase = getServiceClient();
  const startedAt = new Date().toISOString();
  const desde = new Date(Date.now() - janelaHoras * 3600_000).toISOString();

  try {
    const { data: curtos, error } = await supabase
      .from("memoria_lead")
      .select("id, lead_id, tenant_id, fato, modulo, criado_em, valencia_emocional")
      .eq("escopo", "curto")
      .eq("ativa", true)
      .is("destilado_em", null)
      .gte("criado_em", desde)
      .order("criado_em", { ascending: true })
      .limit(5000);
    if (error) return jsonResponse({ ok: false, motivo: error.message }, 500);
    const rows = (curtos ?? []) as CurtoRow[];
    if (rows.length === 0) return jsonResponse({ ok: true, started_at: startedAt, motivo: "sem_curtos_pendentes", leads: 0, fatos_inseridos: 0 });

    const porLead = new Map<string, CurtoRow[]>();
    for (const r of rows) {
      if (!porLead.has(r.lead_id)) porLead.set(r.lead_id, []);
      porLead.get(r.lead_id)!.push(r);
    }

    let leadsProcessados = 0;
    let leadsPulados = 0;
    let fatosInseridos = 0;
    const detalhes: Array<{ lead_id: string; ok: boolean; fatos?: number; motivo?: string }> = [];

    for (const [lead_id, curtosLead] of Array.from(porLead.entries()).slice(0, limiteLeads)) {
      if (curtosLead.length < minCurtosPorLead) {
        leadsPulados++;
        continue;
      }
      const tenant_id = curtosLead[0].tenant_id;
      const ids = curtosLead.map((r) => r.id);
      // A6: o fato longo destilado herda a MAIOR carga emocional dos curtos de origem
      // (a consolidação preserva a emoção — fato emocional é lembrado mais forte).
      const maxValencia = curtosLead.reduce((m, r) => Math.max(m, Number(r.valencia_emocional) || 0), 0);
      const blocos = curtosLead
        .slice(0, 30)
        .map((r) => `[${r.modulo ?? "—"} · ${r.criado_em.slice(0, 16)}] ${r.fato.slice(0, 240)}`)
        .join("\n");

      const llm = await callLLM(supabase, `Memórias de curto prazo do contato (${curtosLead.length} no total nesta janela):\n${blocos}\n\nDestile fatos consolidáveis em JSON.`);
      await logLLMCost(supabase, {
        slug: MODEL,
        tokens_input: llm.tokens_in,
        tokens_output: llm.tokens_out,
        latencia_ms: llm.latencia_ms,
        tipo: "destilar_memoria",
        status: llm.ok ? "sucesso" : "erro",
        erro: llm.ok ? null : llm.motivo,
        metadata: { lead_id, tenant_id, curtos_lidos: curtosLead.length },
      });

      if (!llm.ok) {
        detalhes.push({ lead_id, ok: false, motivo: llm.motivo });
        continue;
      }

      const parsed = parseJson(llm.text);
      const fatos = (parsed?.fatos ?? []).filter((f) => f?.fato && f.fato.trim().length > 5);
      if (fatos.length === 0) {
        await supabase
          .from("memoria_lead")
          .update({ destilado_em: new Date().toISOString() })
          .in("id", ids);
        detalhes.push({ lead_id, ok: true, fatos: 0 });
        continue;
      }

      let inseridosLead = 0;
      for (const f of fatos.slice(0, 8)) {
        const conf = Math.min(1.0, Math.max(0.5, Number(f.confianca) || 0.8));
        const rel = (f.relevancia === "alta" || f.relevancia === "baixa") ? f.relevancia : "media";
        const cat = normalizarCategoriaMemoria(f.categoria);
        const validFrom = (f.valido_desde && /^\d{4}-\d{2}-\d{2}/.test(f.valido_desde)) ? f.valido_desde : null;
        const { error: insErr } = await supabase.from("memoria_lead").insert({
          lead_id,
          tenant_id,
          fato: f.fato.slice(0, 500),
          categoria: cat,
          relevancia: rel,
          // CHECK lead_memory_fonte_check só aceita auto|manual|teste|producao
          // (NÃO 'destilacao_cron' — 2º campo que violava o constraint e fazia
          // 100% dos inserts falharem). Rastreabilidade da destilação fica via
          // escopo='longo' + origem_curto_ids preenchido. Onda 2026-05-16.
          fonte: "auto",
          confianca: conf,
          escopo: "longo",
          modulo: null,
          ativa: true,
          embedding_status: "pendente",
          valido_desde: validFrom,
          valencia_emocional: maxValencia,
          origem_curto_ids: ids,
        });
        if (!insErr) inseridosLead++;
      }

      // Onda 2026-05-16 — só marca destilado_em E desativa os curtos se ao
      // menos 1 fato longo entrou. Se inseridosLead=0 (todos os inserts
      // falharam), NÃO marca → reprocessa na próxima execução do cron.
      if (inseridosLead > 0) {
        await supabase
          .from("memoria_lead")
          .update({ destilado_em: new Date().toISOString(), ativa: false, sistema_expirou_em: new Date().toISOString() })
          .in("id", ids);
      }

      fatosInseridos += inseridosLead;
      leadsProcessados++;
      detalhes.push({ lead_id, ok: inseridosLead > 0, fatos: inseridosLead });
    }

    return jsonResponse({
      ok: true,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      janela_horas: janelaHoras,
      min_curtos_por_lead: minCurtosPorLead,
      curtos_lidos: rows.length,
      leads_no_lote: porLead.size,
      leads_processados: leadsProcessados,
      leads_pulados_min: leadsPulados,
      fatos_inseridos: fatosInseridos,
      detalhes: detalhes.slice(0, 50),
    });
  } catch (e) {
    return jsonResponse({ ok: false, started_at: startedAt, motivo: (e as Error).message }, 500);
  }
});
