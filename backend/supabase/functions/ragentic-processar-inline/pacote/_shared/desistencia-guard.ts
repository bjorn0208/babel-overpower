import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Guard de desistência — rastreia retomadas sem resposta e marca lead como desistente
// quando o limite configurado for atingido.
// Fase 1.5 do projeto automações RAG-FIRST (DEC-017).

/**
 * Verifica se o lead atingiu o limite de retomadas sem resposta.
 * Se sim: atualiza fase_pipeline='desistiu', desliga agente e cancela acoes_agendadas pendentes.
 * Retorna { desistiu: true } para que o caller pule a criação de nova retomada.
 */
export async function verificarDesistenciaELimite(
  supabase: SupabaseClient,
  conversationId: string,
  leadId: string | null,
  agentId: string,
): Promise<{ desistiu: boolean; retomadas: number; limite: number }> {
  const { data: ag } = await supabase.from("agentes_usuario")
    .select("configuracao").eq("id", agentId).maybeSingle();
  const limite = Number(
    ((ag?.configuracao as Record<string, unknown> | undefined)?.automacoes as Record<string, unknown> | undefined)?.max_retomadas_sem_resposta ?? 3,
  );

  const { data: card } = await supabase.from("fichas_lead")
    .select("id, dados_capturados").eq("conversation_id", conversationId).maybeSingle();
  const dados = (card?.dados_capturados as Record<string, string> | null) ?? {};
  const retomadas = Number(dados.retomadas_sem_resposta ?? 0);

  if (retomadas >= limite) {
    if (leadId) {
      await supabase.from("leads").update({
        fase_pipeline: "desistiu",
      }).eq("id", leadId);
    }
    await supabase.from("conversas").update({
      agent_enabled: false,
    }).eq("id", conversationId);
    await supabase.from("acoes_agendadas").update({ status: 'cancelado' })
      .eq("conversation_id", conversationId).eq("status", "pendente");
    return { desistiu: true, retomadas, limite };
  }
  return { desistiu: false, retomadas, limite };
}

/**
 * Incrementa o contador de retomadas sem resposta no lead_card.
 * Chamado após cada `retomada_planejada` consumida com sucesso (lead não respondeu).
 */
export async function incrementarRetomadasSemResposta(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const { data: card } = await supabase.from("fichas_lead")
    .select("id, dados_capturados").eq("conversation_id", conversationId).maybeSingle();
  if (!card) return;
  const dados = (card.dados_capturados as Record<string, string> | null) ?? {};
  const atual = Number(dados.retomadas_sem_resposta ?? 0);
  dados.retomadas_sem_resposta = String(atual + 1);
  await supabase.from("fichas_lead").update({ dados_capturados: dados }).eq("id", card.id);
}

/**
 * Zera o contador de retomadas sem resposta quando o lead manda mensagem real.
 * Chamado no início do turno de chat quando `!isAutoResume`.
 * Só escreve se o contador não estiver já em "0" (evita write desnecessário).
 */
export async function zerarRetomadasSemResposta(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const { data: card } = await supabase.from("fichas_lead")
    .select("id, dados_capturados").eq("conversation_id", conversationId).maybeSingle();
  if (!card) return;
  const dados = (card.dados_capturados as Record<string, string> | null) ?? {};
  if (dados.retomadas_sem_resposta && dados.retomadas_sem_resposta !== "0") {
    dados.retomadas_sem_resposta = "0";
    await supabase.from("fichas_lead").update({ dados_capturados: dados }).eq("id", card.id);
  }
}
