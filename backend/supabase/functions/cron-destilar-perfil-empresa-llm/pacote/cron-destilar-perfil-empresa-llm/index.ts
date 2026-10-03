/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// ============================================================================
// cron-destilar-perfil-empresa-llm (Onda 12 — B3-V2)
//
// Roda 1×/semana (domingo 04:30 UTC = 01:30 BRT). Pra cada tenant:
// 1. Agrega memoria_lead + leads.desfecho recentes (até MAX_LEADS_POR_TENANT)
// 2. Chama LLM Mentor (config_chamadas_llm.mentor) pra destilar 6 campos
//    QUALITATIVOS (os 3 quantitativos — ticket_medio_estimado,
//    prazo_decisao_medio_dias, taxa_conversao_estimada — são preenchidos pela
//    rotina SQL V1, não pela LLM):
//    - top_objecoes (jsonb array)
//    - top_pontos_dor (jsonb array)
//    - top_diferenciais (jsonb array)
//    - argumentos_ganhadores (jsonb array)
//    - argumentos_perdedores (jsonb array)
//    - perfil_lead_ideal (jsonb objeto/string)
// 3. UPDATE perfil_empresa só nesses 6 campos + destilacao_ultima_em + versao.
//
// Custo controlado: 1 chamada Mentor (gemini-2.5-pro) por tenant/semana.
// Falha-aberta: tenant que falhar é skipped, continua outros.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getConfigChamada } from "../_shared/config-chamadas.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const MAX_LEADS_POR_TENANT = 30; // limite pra controlar custo do contexto

// deno-lint-ignore no-explicit-any
async function chamarMentor(prompt: string): Promise<any | null> {
  try {
    const cfg = await getConfigChamada(supabase, "mentor");
    const { data: prov } = await supabase
      .from("provedores_llm")
      .select("base_url, api_key")
      .eq("slug", "openrouter")
      .eq("is_active", true)
      .single();
    if (!prov?.api_key) return null;
    const r = await fetch(`${prov.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${prov.api_key}`,
      },
      body: JSON.stringify({
        model: cfg.modelo,
        messages: [
          {
            role: "system",
            content:
              "Você é um analista de vendas estratégico. Receba histórico real de conversas de um tenant " +
              "e destile padrões qualitativos. Responda APENAS JSON válido com EXATAMENTE 6 campos: " +
              '{"top_objecoes": [string], "top_pontos_dor": [string], "top_diferenciais": [string], ' +
              '"argumentos_ganhadores": [string], "argumentos_perdedores": [string], "perfil_lead_ideal": string}. ' +
              "Cada lista com no máximo 5 itens curtos (≤120 caracteres cada). " +
              "Sem comentários, sem markdown, sem campos extras.",
          },
          { role: "user", content: prompt.slice(0, 12000) },
        ],
        temperature: cfg.temperatura,
        max_tokens: cfg.max_tokens,
        response_format: { type: "json_object" },
      }),
    });
    const j = await r.json();
    const conteudo = j?.choices?.[0]?.message?.content;
    if (!conteudo) return null;
    return JSON.parse(conteudo);
  } catch (e) {
    console.error("[destilar-llm] erro Mentor:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function destilarTenant(tenantId: string): Promise<boolean> {
  // Coletar últimas N conversas/leads recentes com desfecho cravado
  // deno-lint-ignore no-explicit-any
  const { data: leadsAlvo } = await (supabase as any)
    .from("leads")
    .select("id, name, desfecho, desfecho_motivo, valor_conversao, desfecho_em")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .not("desfecho", "is", null)
    .neq("desfecho", "em_aberto")
    .order("desfecho_em", { ascending: false, nullsFirst: false })
    .limit(MAX_LEADS_POR_TENANT);

  if (!leadsAlvo?.length) {
    console.log(`[destilar-llm] tenant ${tenantId}: sem leads com desfecho, skip`);
    return false;
  }

  // Coletar fatos de memoria_lead pros leads alvo
  // deno-lint-ignore no-explicit-any
  const leadIds = leadsAlvo.map((l: any) => l.id);
  // deno-lint-ignore no-explicit-any
  const { data: fatos } = await (supabase as any)
    .from("memoria_lead")
    .select("lead_id, fato, categoria")
    .in("lead_id", leadIds)
    .limit(200);

  // Montar prompt textual
  const fatosPorLead = new Map<string, string[]>();
  // deno-lint-ignore no-explicit-any
  (fatos ?? []).forEach((f: any) => {
    if (!fatosPorLead.has(f.lead_id)) fatosPorLead.set(f.lead_id, []);
    fatosPorLead.get(f.lead_id)!.push(`(${f.categoria}) ${f.fato}`);
  });

  let prompt = `Analise estas ${leadsAlvo.length} negociações:\n\n`;
  // deno-lint-ignore no-explicit-any
  leadsAlvo.forEach((l: any, i: number) => {
    prompt += `--- Lead ${i + 1}: ${l.name ?? "(s/nome)"} ---\n`;
    prompt += `Desfecho: ${l.desfecho}${l.valor_conversao ? ` (R$${l.valor_conversao})` : ""}${l.desfecho_motivo ? ` — motivo: ${l.desfecho_motivo}` : ""}\n`;
    const fs = fatosPorLead.get(l.id) ?? [];
    if (fs.length) prompt += `Fatos: ${fs.slice(0, 8).join("; ")}\n`;
    prompt += "\n";
  });
  prompt +=
    "\nDestile padrões em JSON (top_objecoes, top_pontos_dor, top_diferenciais, " +
    "argumentos_ganhadores, argumentos_perdedores, perfil_lead_ideal).";

  const destilado = await chamarMentor(prompt);
  if (!destilado) return false;

  // UPDATE perfil_empresa nos 6 campos qualitativos + metadata
  // deno-lint-ignore no-explicit-any
  await (supabase as any)
    .from("perfil_empresa")
    .update({
      top_objecoes: destilado.top_objecoes ?? [],
      top_pontos_dor: destilado.top_pontos_dor ?? [],
      top_diferenciais: destilado.top_diferenciais ?? [],
      argumentos_ganhadores: destilado.argumentos_ganhadores ?? [],
      argumentos_perdedores: destilado.argumentos_perdedores ?? [],
      perfil_lead_ideal: destilado.perfil_lead_ideal ?? null,
      destilacao_ultima_em: new Date().toISOString(),
      conversas_destiladas: leadsAlvo.length,
      versao: 2,
    })
    .eq("tenant_id", tenantId);

  console.log(`[destilar-llm] tenant ${tenantId} destilado V2 OK (6 campos qualitativos)`);
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  const { ok: _cronOk } = await autorizarCron(req);
  if (!_cronOk) {
    return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Buscar tenants com perfil_empresa cujo profile esteja ATIVO.
  // perfil_empresa não tem deleted_at (hard-delete); profiles tem is_active.
  // Inner join pra evitar gastar LLM com tenant desativado/arquivado.
  // deno-lint-ignore no-explicit-any
  const { data: tenants } = await (supabase as any)
    .from("perfil_empresa")
    .select("tenant_id, destilacao_ultima_em, profiles!inner(id, is_active)")
    .eq("profiles.is_active", true)
    .limit(50);

  if (!tenants?.length) {
    return new Response(JSON.stringify({ ok: true, destilados: 0, motivo: "sem perfis ativos" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let destilados = 0;
  let falhas = 0;
  // deno-lint-ignore no-explicit-any
  for (const t of tenants as any[]) {
    try {
      const ok = await destilarTenant(t.tenant_id);
      if (ok) destilados++;
      else falhas++;
    } catch (e) {
      console.error(`[destilar-llm] erro tenant ${t.tenant_id}:`, e);
      falhas++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, destilados, falhas, total: tenants.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
