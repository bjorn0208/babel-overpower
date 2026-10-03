/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// ============================================================================
// cron-sono-do-agente — Onda 14 (Sono completo)
//
// Roda toda noite (03:00 BRT = 06:00 UTC). Pra cada agente ativo:
// 1. Coleta últimas 20 conversas reais (não-teste) das últimas 7 noites
// 2. Identifica padrões via LLM Mentor barato (gemini-2.5-flash):
//    - Argumentos que funcionaram (lead respondeu bem)
//    - Erros recorrentes (lead reagiu mal)
//    - Objeções novas que o agente não soube responder
// 3. Cada padrão vira proposta_aprendizado pra curador humano aprovar
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getConfigChamada } from "../_shared/config-chamadas.ts";
import { autorizarCron } from "../_shared/auth-cron.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const MAX_AGENTES_POR_RUN = 30;
const MAX_CONVERSAS_POR_AGENTE = 20;

// deno-lint-ignore no-explicit-any
async function chamarMentorBarato(prompt: string): Promise<any | null> {
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
        model: "google/gemini-2.5-flash", // forçado barato pro sono
        messages: [
          {
            role: "system",
            content:
              "Você é o agente analisando suas próprias conversas DA NOITE PASSADA. " +
              "Identifique padrões valiosos pra propor ao curador humano. " +
              "Retorne APENAS JSON com array 'propostas' — cada item: " +
              '{"tipo": "argumento_ganhador"|"erro_recorrente"|"objecao_nova", "titulo": string curta, "exemplo_conversa": string com 1 frase do lead, "sugestao": string com o que o agente devia fazer/responder, "confianca": 0.0-1.0}. ' +
              "Máximo 3 propostas. Apenas as MAIS valiosas (descarte ruído).",
          },
          { role: "user", content: prompt.slice(0, 10000) },
        ],
        temperature: 0.6,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    });
    const j = await r.json();
    const conteudo = j?.choices?.[0]?.message?.content;
    if (!conteudo) return null;
    return JSON.parse(conteudo);
  } catch (e) {
    console.error("[sono] erro mentor:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function processarAgente(agenteId: string): Promise<number> {
  // Coletar conversas reais recentes
  // deno-lint-ignore no-explicit-any
  const { data: conversas } = await (supabase as any)
    .from("conversas")
    .select("id, lead_id")
    .eq("agente_id", agenteId)
    .neq("canal", "teste")
    .gte("atualizado_em", new Date(Date.now() - 7 * 86400_000).toISOString())
    .order("atualizado_em", { ascending: false })
    .limit(MAX_CONVERSAS_POR_AGENTE);

  if (!conversas?.length) return 0;

  // deno-lint-ignore no-explicit-any
  const ids = conversas.map((c: any) => c.id);

  // Pegar mensagens das conversas (últimas 8 por conversa)
  // deno-lint-ignore no-explicit-any
  const { data: msgs } = await (supabase as any)
    .from("mensagens")
    .select("conversa_id, role, content, created_at")
    .in("conversa_id", ids)
    .order("created_at", { ascending: false })
    .limit(300);

  if (!msgs?.length) return 0;

  // Montar texto pro Mentor: agrupar por conversa
  // deno-lint-ignore no-explicit-any
  const porConversa = new Map<string, any[]>();
  // deno-lint-ignore no-explicit-any
  msgs.forEach((m: any) => {
    if (!porConversa.has(m.conversa_id)) porConversa.set(m.conversa_id, []);
    porConversa.get(m.conversa_id)!.push(m);
  });

  let prompt = `Analise estas ${porConversa.size} conversas da noite:\n\n`;
  let idx = 1;
  for (const [, ms] of porConversa) {
    prompt += `--- Conversa ${idx++} ---\n`;
    ms.slice(0, 8).reverse().forEach((m) => {
      const quem = m.role === "user" ? "Lead" : "Agente";
      prompt += `${quem}: ${String(m.content || "").slice(0, 200)}\n`;
    });
    prompt += "\n";
  }
  prompt += "Identifique 3 propostas máximas. JSON.";

  const destilado = await chamarMentorBarato(prompt);
  if (!destilado?.propostas?.length) return 0;

  // Gravar propostas
  let inseridas = 0;
  for (const p of destilado.propostas) {
    if (!p?.titulo) continue;
    try {
      // deno-lint-ignore no-explicit-any
      await (supabase as any).from("propostas_aprendizado").insert({
        agente_id: agenteId,
        origem: "sono_do_agente",
        conteudo: p,
        status: "pendente",
      });
      inseridas++;
    } catch (e) {
      console.warn("[sono] erro insert proposta:", e instanceof Error ? e.message : String(e));
    }
  }
  return inseridas;
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

  // Listar agentes ativos
  // deno-lint-ignore no-explicit-any
  const { data: agentes } = await (supabase as any)
    .from("agentes_usuario")
    .select("id")
    .eq("ativo", true)
    .limit(MAX_AGENTES_POR_RUN);

  if (!agentes?.length) {
    return new Response(JSON.stringify({ ok: true, processados: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let totalPropostas = 0;
  let totalAgentes = 0;
  // deno-lint-ignore no-explicit-any
  for (const a of agentes as any[]) {
    try {
      const n = await processarAgente(a.id);
      totalPropostas += n;
      if (n > 0) totalAgentes++;
    } catch (e) {
      console.error(`[sono] erro agente ${a.id}:`, e instanceof Error ? e.message : String(e));
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      agentes_com_propostas: totalAgentes,
      propostas_geradas: totalPropostas,
      tempo: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
