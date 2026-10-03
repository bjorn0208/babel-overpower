/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { callLLM, tentarParseJson } from "./llm.ts";
import type { ConversaAmostra } from "./amostra.ts";

type ResumoEpisodio = {
  episodio_resumo: string;
  gancho: string;
  emocao: string;
  turno_inicio: number;
  turno_fim: number;
  relevancia: number;
};

const PROMPT_SYSTEM = `Você analisa uma conversa entre um agente de IA e um lead, e identifica o "episódio mais marcante" — um momento que faria sentido ser lembrado em futuras conversas.

Devolva UM ÚNICO JSON com:
- episodio_resumo (string, 2-3 frases): o que aconteceu nesse momento
- gancho (string, 1 frase curta): frase evocativa que o agente pode usar pra puxar essa lembrança ("lembra quando você me contou que...")
- emocao (string, 1 palavra): emoção dominante (alegre, preocupado, curioso, frustrado, esperançoso, surpreso, neutro)
- turno_inicio (int): índice do turno onde o episódio começa
- turno_fim (int): índice do turno onde o episódio termina
- relevancia (numero 0-1): quão importante é lembrar disso

Se a conversa não tem nenhum momento marcante, devolva: {"sem_episodio": true}`;

export async function consolidarConversa(
  supabase: SupabaseClient,
  conversa: ConversaAmostra,
): Promise<{ inseridos: number; motivo?: string }> {
  // 1) Lê mensagens da conversa
  const { data: messages, error: msgErr } = await supabase
    .from("mensagens")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversa.conversation_id)
    .order("created_at", { ascending: true })
    .limit(80);

  if (msgErr || !messages || messages.length === 0) {
    return { inseridos: 0, motivo: msgErr?.message ?? "sem_messages" };
  }

  // 2) Monta texto pra LLM (numerado por turno)
  const conversaTexto = messages
    .map((m, i) => `[turno ${i + 1}] ${m.role}: ${m.content?.slice(0, 400)}`)
    .join("\n");

  // 3) LLM
  const llmRes = await callLLM(
    supabase,
    [
      { role: "system", content: PROMPT_SYSTEM },
      { role: "user", content: `Conversa:\n${conversaTexto}\n\nDevolva o JSON do episódio mais marcante.` },
    ],
    { temperature: 0.3, max_tokens: 600, json_mode: true },
  );

  if (!llmRes.ok) {
    return { inseridos: 0, motivo: `llm: ${llmRes.motivo}` };
  }

  const parsed = tentarParseJson<ResumoEpisodio | { sem_episodio: true }>(llmRes.text);
  if (!parsed || "sem_episodio" in parsed) {
    return { inseridos: 0, motivo: "sem_episodio" };
  }

  // 4) INSERT memoria_episodica
  const { error: insErr } = await supabase.from("memoria_episodica").insert({
    tenant_id: conversa.tenant_id,
    conversation_id: conversa.conversation_id,
    lead_id: conversa.lead_id,
    episodio_resumo: parsed.episodio_resumo,
    gancho: parsed.gancho,
    emocao: parsed.emocao,
    turno_inicio: Math.max(1, Math.min(parsed.turno_inicio, messages.length)),
    turno_fim: Math.max(1, Math.min(parsed.turno_fim, messages.length)),
    relevancia: Math.max(0, Math.min(parsed.relevancia, 1)),
  });

  if (insErr) {
    return { inseridos: 0, motivo: `insert: ${insErr.message}` };
  }

  return { inseridos: 1 };
}
