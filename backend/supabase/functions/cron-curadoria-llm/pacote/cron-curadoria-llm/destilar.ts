/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { callLLM, tentarParseJson } from "./llm.ts";

type Insight = {
  excerto: string;
  contexto: string;
  tipo_sugerido: string;
  categoria_sugerida: string;
};

type DestilarResult = { insights: Insight[] };

const PROMPT_SYSTEM = `Você analisa um lote de excertos de conversas reais entre agentes de IA e leads (mesmo tenant). Identifica padrões REPETIDOS — falas, dúvidas, objeções ou respostas que aparecem em conversas de leads diferentes e que poderiam virar conhecimento estruturado pro agente.

Devolva UM ÚNICO JSON {"insights": [...]} com até 5 insights. Cada insight:
- excerto (string): exemplo concreto da conversa, parafraseado pra ser genérico
- contexto (string): em que situação esse padrão aparece
- tipo_sugerido (string): "objecao" | "duvida_frequente" | "resposta_padrao" | "comportamento_lead" | "experiencia"
- categoria_sugerida (string): categoria curta (ex: "preço", "prazo", "garantia", "urgência")

Se nenhum padrão repetido, devolva {"insights": []}.`;

export async function destilarInsightsCrossConversa(
  supabase: SupabaseClient,
  tenantId: string,
  conversationIds: string[],
): Promise<{ inseridos: number; motivo?: string }> {
  if (conversationIds.length < 3) {
    return { inseridos: 0, motivo: "amostra_pequena" };
  }

  // 1) Lê mensagens das conversas (sample compacto)
  const { data: messages, error: msgErr } = await supabase
    .from("mensagens")
    .select("id, conversation_id, role, content, lead_id")
    .in("conversation_id", conversationIds)
    .limit(400);

  if (msgErr || !messages || messages.length === 0) {
    return { inseridos: 0, motivo: msgErr?.message ?? "sem_messages" };
  }

  // 2) Agrupa por conversa
  const porConversa = new Map<string, Array<{ role: string; content: string; lead_id: string | null }>>();
  for (const m of messages) {
    if (!porConversa.has(m.conversation_id)) porConversa.set(m.conversation_id, []);
    porConversa.get(m.conversation_id)!.push({ role: m.role, content: m.content, lead_id: m.lead_id });
  }

  // 3) Texto compacto por conversa
  const blocos = Array.from(porConversa.entries())
    .slice(0, 10)
    .map(([cid, msgs], i) => {
      const txt = msgs.slice(0, 16).map((m) => `${m.role}: ${m.content?.slice(0, 200)}`).join(" | ");
      return `[conversa ${i + 1} (${cid.slice(0, 8)})] ${txt}`;
    })
    .join("\n\n");

  // 4) LLM
  const llmRes = await callLLM(
    supabase,
    [
      { role: "system", content: PROMPT_SYSTEM },
      { role: "user", content: `Lote de conversas:\n${blocos}\n\nDestile insights cross-conversa em JSON.` },
    ],
    { temperature: 0.4, max_tokens: 1200, json_mode: true },
  );

  if (!llmRes.ok) {
    return { inseridos: 0, motivo: `llm: ${llmRes.motivo}` };
  }

  const parsed = tentarParseJson<DestilarResult>(llmRes.text);
  if (!parsed || !Array.isArray(parsed.insights) || parsed.insights.length === 0) {
    return { inseridos: 0, motivo: "sem_insights" };
  }

  // 5) Pra cada insight, INSERT candidatos_bloco com num_leads_independentes derivado
  let inseridos = 0;
  const leadsPorConversa = new Map<string, Set<string>>();
  for (const m of messages) {
    if (!m.lead_id) continue;
    if (!leadsPorConversa.has(m.conversation_id)) leadsPorConversa.set(m.conversation_id, new Set());
    leadsPorConversa.get(m.conversation_id)!.add(m.lead_id);
  }
  const allLeads = new Set<string>();
  for (const set of leadsPorConversa.values()) {
    for (const l of set) allLeads.add(l);
  }
  const evidenciaArr = Array.from(allLeads);

  for (const insight of parsed.insights) {
    const { error: insErr } = await supabase.from("candidatos_bloco").insert({
      tenant_id: tenantId,
      excerto: insight.excerto.slice(0, 2000),
      contexto: insight.contexto.slice(0, 1000),
      tipo_sugerido: insight.tipo_sugerido,
      categoria_sugerida: insight.categoria_sugerida,
      num_leads_independentes: evidenciaArr.length,
      evidencia_lead_ids: evidenciaArr,
      status: 'pendente',
    });
    if (!insErr) inseridos++;
    else console.warn(`[destilar] insert chunk_candidate falhou: ${insErr.message}`);
  }

  return { inseridos };
}
