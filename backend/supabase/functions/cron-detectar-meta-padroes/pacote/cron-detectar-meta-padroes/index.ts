/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { autorizarCron } from "../_shared/auth-cron.ts";

// cron-detectar-meta-padroes
// Roda manualmente (modo semantico). Detecta meta-padrões agregados cross-tenant a partir de
// conversas reais, gera blocos_meta com escopo='global'.
// Auth: service_role no Authorization header.

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

type MetaPadrao = {
  tag: string;
  corpo: string;
  citacao_kb?: string;
  prioridade?: number;
  tags_relacionadas?: string[];
};

const PROMPT_SYSTEM = `Você analisa um lote de conversas reais entre agentes de IA e leads (cross-tenant, vários nichos). Identifica META-PADRÕES MACRO — tendências que aparecem em pelo menos 3 conversas de tenants diferentes e que ensinariam o agente a antecipar a situação.

Exemplos de meta-padrão:
- "objeção sobre preço dispara em ~70% dos turnos pós-apresentação do valor"
- "lead pede comprovante de outros casos quando preço supera R$ 500"
- "silêncio do lead após pergunta direta = ele não entendeu, refrasear"

Devolva UM ÚNICO JSON {"meta_padroes":[...]} com até 6 padrões. Cada padrão:
- tag (string, snake_case, kebab-case proibido, max 60 chars): identificador curto único, ex: "objecao_preco_pos_apresentacao"
- corpo (string, 2-4 frases): descreve o padrão observado e a heurística que o agente deveria adotar
- citacao_kb (string opcional): citação literal de 1 conversa que ilustra o padrão
- prioridade (int 100-900, default 500): quanto maior, mais relevante
- tags_relacionadas (array de strings curtas)

Se nenhum padrão atravessa ≥3 tenants distintos, devolva {"meta_padroes": []}.`;

async function callLLM(supabase: SupabaseClient, userPrompt: string): Promise<{ ok: boolean; text: string; motivo?: string }> {
  const apiKey = await getOpenRouterKey(supabase);
  if (!apiKey) return { ok: false, text: "", motivo: "openrouter_key_indisponivel" };
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://plataforma-limpa.com",
        "X-Title": "cron-detectar-meta-padroes",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: PROMPT_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return { ok: false, text: "", motivo: `openrouter ${r.status}: ${(await r.text()).slice(0, 300)}` };
    const data = await r.json();
    return { ok: true, text: data?.choices?.[0]?.message?.content ?? "" };
  } catch (e) {
    return { ok: false, text: "", motivo: `exception: ${(e as Error).message}` };
  }
}

function parseJson(text: string): { meta_padroes?: MetaPadrao[] } | null {
  try { return JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
}

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
  const limiteConv = Math.min(50, Math.max(6, parseInt(url.searchParams.get("limite") ?? "30", 10)));
  const minTenants = Math.max(2, parseInt(url.searchParams.get("min_tenants") ?? "3", 10));

  const supabase = getServiceClient();
  const startedAt = new Date().toISOString();

  try {
    const { data: convs, error: convErr } = await supabase
      .from("conversas")
      .select("id, tenant_id, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limiteConv);
    if (convErr) return jsonResponse({ ok: false, motivo: convErr.message }, 500);
    const conversas = (convs ?? []).filter((c) => c.id && c.tenant_id);
    const tenantsCobertos = new Set(conversas.map((c) => c.tenant_id));
    if (tenantsCobertos.size < minTenants) {
      return jsonResponse({ ok: true, started_at: startedAt, conversas: conversas.length, tenants: tenantsCobertos.size, motivo: "amostra_pequena_cross_tenant", inseridos: 0 });
    }

    const cids = conversas.map((c) => c.id);
    const { data: msgs } = await supabase
      .from("mensagens")
      .select("conversation_id, role, content")
      .in("conversation_id", cids)
      .is("deleted_at", null)
      .limit(800);

    const porConversa = new Map<string, Array<{ role: string; content: string }>>();
    for (const m of msgs ?? []) {
      if (!m.content) continue;
      if (!porConversa.has(m.conversation_id)) porConversa.set(m.conversation_id, []);
      porConversa.get(m.conversation_id)!.push({ role: m.role, content: m.content });
    }

    const blocos = Array.from(porConversa.entries())
      .filter(([, arr]) => arr.length >= 6)
      .slice(0, 20)
      .map(([cid, arr], i) => {
        const linhas = arr.slice(0, 14).map((m) => `${m.role}: ${(m.content ?? "").slice(0, 180)}`).join(" | ");
        return `[c${i + 1} (${cid.slice(0, 8)})] ${linhas}`;
      })
      .join("\n\n");
    if (!blocos) return jsonResponse({ ok: true, started_at: startedAt, motivo: "sem_blocos_uteis", inseridos: 0 });

    const llmRes = await callLLM(supabase, `Lote cross-tenant (${tenantsCobertos.size} tenants):\n${blocos}\n\nDestile meta-padrões em JSON.`);
    if (!llmRes.ok) return jsonResponse({ ok: false, started_at: startedAt, motivo: `llm: ${llmRes.motivo}` }, 500);

    const parsed = parseJson(llmRes.text);
    const padroes = (parsed?.meta_padroes ?? []).filter((p) => p?.tag && p?.corpo);
    if (padroes.length === 0) return jsonResponse({ ok: true, started_at: startedAt, conversas: conversas.length, tenants: tenantsCobertos.size, inseridos: 0, motivo: "sem_padroes_detectados" });

    const tagsExistentes = new Set<string>();
    {
      const { data: existentes } = await supabase
        .from("blocos_meta")
        .select("tag")
        .eq("escopo", "global")
        .eq("ativo", true);
      for (const r of existentes ?? []) if (r.tag) tagsExistentes.add(r.tag as string);
    }

    let inseridos = 0;
    const detalhes: Array<{ tag: string; ok: boolean; motivo?: string }> = [];
    for (const p of padroes) {
      const tag = p.tag.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 60);
      if (!tag) { detalhes.push({ tag: p.tag, ok: false, motivo: "tag_vazia" }); continue; }
      if (tagsExistentes.has(tag)) { detalhes.push({ tag, ok: false, motivo: "ja_existe" }); continue; }
      const prioridade = Math.min(900, Math.max(100, Number(p.prioridade) || 500));
      const tags = Array.isArray(p.tags_relacionadas) ? p.tags_relacionadas.slice(0, 12).map(String) : [];
      const { error: insErr } = await supabase.from("blocos_meta").insert({
        escopo: "global",
        nicho_id: null,
        tenant_id: null,
        tag,
        corpo: p.corpo.slice(0, 2000),
        citacao_kb: p.citacao_kb?.slice(0, 1000) ?? null,
        prioridade,
        tags,
        origem: "meta_padrao_llm",
        stability_tier: "experimental",
        ativo: true,
      });
      if (insErr) { detalhes.push({ tag, ok: false, motivo: insErr.message }); continue; }
      tagsExistentes.add(tag);
      inseridos++;
      detalhes.push({ tag, ok: true });
    }

    return jsonResponse({
      ok: true,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      conversas: conversas.length,
      tenants: tenantsCobertos.size,
      padroes_recebidos: padroes.length,
      inseridos,
      detalhes,
    });
  } catch (e) {
    return jsonResponse({ ok: false, started_at: startedAt, motivo: (e as Error).message }, 500);
  }
});
