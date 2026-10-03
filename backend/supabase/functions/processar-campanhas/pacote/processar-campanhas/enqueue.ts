import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

/**
 * Enrolla leads na campanha (insere campaign_leads em phase=aguardando, state=ativo).
 * INDEPENDENTE de janela/throttle — visível na esteira imediato. Sem acoes_agendadas ainda.
 * Retorna a lista dos campaign_leads criados (id + lead_id).
 */
export async function enrollarLeads(
  sb: SupabaseClient,
  campaignId: string,
  leadIds: string[],
  configSnapshot: Record<string, unknown>,
): Promise<Array<{ id: string; lead_id: string }>> {
  if (leadIds.length === 0) return []

  const { data, error } = await sb
    .from("leads_campanha")
    .insert(
      leadIds.map((lead_id) => ({
        campaign_id: campaignId,
        lead_id,
        phase: "aguardando",
        state: "ativo",
        config_snapshot: configSnapshot,
      })),
    )
    .select("id, lead_id")

  if (error) throw error
  return (data ?? []) as Array<{ id: string; lead_id: string }>
}

/**
 * Cria acoes_agendadas (action_type='campaign_trigger') pros campaign_leads passados.
 * Respeita o que vier no `alvo` — caller já filtrou por janela/throttle.
 * Em caso de falha, faz rollback dos acoes_agendadas inseridos (não dos campaign_leads).
 */
export async function agendarDisparos(
  sb: SupabaseClient,
  campaignId: string,
  tenantId: string,
  alvo: Array<{ id: string; lead_id: string }>,
): Promise<number> {
  if (alvo.length === 0) return 0

  const agora = new Date().toISOString()

  // Fix 2026-05-11 · trocar bulk INSERT por RPC enfileirar_acao_agendada em
  // paralelo. RPC e idempotente (UNIQUE em conv,type,scheduled_at em status
  // pendente/processando), entao reagendamentos da mesma campanha pro mesmo
  // lead nao duplicam disparo. Custo: N RPC calls de ~1ms cada.
  // Δ 2026-09-12 (⑥): era um `Promise.all` em cima da lista inteira. Com throttle
  // configurado são poucos, mas quando o tenant não configura nada o default é
  // 1000 slots — e aí eram até 1000 RPCs + 2 consultas cada, todos de uma vez,
  // numa invocação só. Agora vai em lotes: mesmo resultado, sem pico.
  const LOTE_PARALELO = 10
  let agendadas = 0

  const agendarUm = async (cl: { id: string; lead_id: string }) => {
    // Fix 2026-09-08 · era `.maybeSingle()`, que ERRA quando o lead tem mais de uma
    // conversa (caso comum: uma `ativa` + uma `campaign` legada). O erro voltava
    // `conv = null`, a ação nascia com `conversation_id` nulo e o worker cancelava
    // ela em silêncio na primeira guard. Foram 472 disparos perdidos assim.
    // Agora a escolha é determinística: conversa viva mais recente; se todas
    // estiverem encerradas, a mais recente mesmo — o worker reabre no disparo.
    const { data: convs } = await sb
      .from("conversas")
      .select("id, agente_id, status")
      .eq("lead_id", cl.lead_id)
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })

    let conv = (convs ?? []).find((c) => c.status !== "encerrada") ?? (convs ?? [])[0] ?? null

    // Δ 2026-09-12 (Otmar): lead subido por planilha nunca conversou → não tinha
    // conversa → a campanha pulava ele em silêncio (2.259 leads parados em
    // `aguardando`). Agora cria a conversa pela mesma RPC do webhook/app.
    if (!conv) {
      const [{ data: lead }, { data: ag }] = await Promise.all([
        sb.from("leads").select("phone").eq("id", cl.lead_id).maybeSingle(),
        sb.from("agentes_usuario").select("id").eq("user_id", tenantId).limit(1).maybeSingle(),
      ])
      const phone = String(lead?.phone ?? "").replace(/\D/g, "")
      if (phone && ag?.id) {
        const { data: criada, error: errCriar } = await sb.rpc("buscar_ou_criar_conversa", {
          p_phone: phone,
          p_tenant_id: tenantId,
          p_agent_id: ag.id,
          p_channel: "whatsapp",
          p_first_fase: "saudacao",
        })
        const c = (criada as { conversation?: { id?: string; status?: string } } | null)?.conversation
        if (c?.id) conv = { id: c.id, agente_id: ag.id, status: c.status ?? "ativa" }
        else console.error(`[processar-campanhas] lead=${cl.lead_id} sem conversa e RPC não criou:`, errCriar?.message)
      }
    }

    if (!conv) {
      console.warn(
        `[processar-campanhas] lead=${cl.lead_id} campanha=${campaignId} sem conversa no tenant (e sem telefone/agente pra criar) — disparo não enfileirado`,
      )
      return null
    }

    const { data: novoId, error } = await sb.rpc("enfileirar_acao_agendada", {
      p_conversation_id: conv.id,
      p_lead_id: cl.lead_id,
      p_agente_id: conv.agente_id ?? null,
      p_tenant_id: tenantId,
      p_action_type: "campaign_trigger",
      p_scheduled_at: agora,
      p_carga: { campaign_id: campaignId, campaign_lead_id: cl.id },
    })
    if (error) {
      console.error(
        `[processar-campanhas] falha agendar disparo lead=${cl.lead_id} campanha=${campaignId}:`,
        error.message,
      )
      return null
    }
    return novoId
  }

  for (let i = 0; i < alvo.length; i += LOTE_PARALELO) {
    const resultados = await Promise.all(alvo.slice(i, i + LOTE_PARALELO).map(agendarUm))
    for (const id of resultados) {
      if (id) agendadas++
    }
  }
  return agendadas
}

