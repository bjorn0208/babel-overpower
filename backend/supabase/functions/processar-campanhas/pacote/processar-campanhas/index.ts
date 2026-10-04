import { autorizarCron } from "../_shared/auth-cron.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { tenantsPausados } from "../_shared/pausa-tenant.ts";
import { corsHeaders } from "../_shared/cors.ts"
import { criarClienteAdmin } from "../_shared/supabase.ts"
import { getEligibleLeads, getEligibleLeadsCobranca, type Campaign } from "./eligibility.ts"
import { dentroDeJanela, slotsRestantes, type ThrottleConfig } from "./throttle.ts"
import { enrollarLeads, agendarDisparos } from "./enqueue.ts"
import { consultarEmLotes } from "./lotes.ts"

type CampaignRow = Campaign & ThrottleConfig & {
  name: string
  description: string
  response_actions: string[]
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const { ok: authOk } = await autorizarCron(req);
  if (!authOk) return new Response(JSON.stringify({ ok: false, erro: "nao_autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (Deno.env.get("CAMPANHA_DISABLED") === "true") {
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const supabase = criarClienteAdmin()
    const agora = new Date()

    // Cap defensivo de 1000 (auditoria 2026-05-04 R4): com 100 anterior, plataformas
    // com mais de 100 campanhas ativas ignoravam silenciosamente as excedentes.
    // Quando encostarmos no teto, paginação real (cursor por created_at) precisa entrar.
    const TETO_CAMPANHAS = 1000
    const { data: campanhas, error } = await supabase
      .from("campanhas")
      .select("*")
      .eq("status", "ativa")
      .is("deleted_at", null)
      .limit(TETO_CAMPANHAS)
    if (error) throw error
    if ((campanhas?.length ?? 0) >= TETO_CAMPANHAS) {
      console.warn(
        `[process-campaigns] teto de ${TETO_CAMPANHAS} campanhas ativas atingido — paginação cursor precisa ser implementada`,
      )
    }

    let totalDisparado = 0
    const resultados: Array<Record<string, unknown>> = []

    // Δ 2026-09-12 (③): o teto de envio é do NÚMERO do tenant, não de cada
    // campanha. Duas campanhas ativas dividem o mesmo orçamento — antes cada
    // uma tinha o seu, e "15/hora" virava 30/hora no mesmo WhatsApp.
    const campanhasPorTenant = new Map<string, string[]>()
    for (const raw of (campanhas ?? []) as CampaignRow[]) {
      const lista = campanhasPorTenant.get(raw.tenant_id) ?? []
      lista.push(raw.id)
      campanhasPorTenant.set(raw.tenant_id, lista)
    }

    // Δ 2026-09-17 (Theus): freio de mão do tenant. Campanha de tenant pausado
    // não inscreve e não agenda — nada entra na fila enquanto o botão estiver ligado.
    const pausados = await tenantsPausados(supabase, [...campanhasPorTenant.keys()])
    if (pausados.size > 0) {
      console.log(`[process-campaigns] ${pausados.size} tenant(s) com envios pausados — pulando`)
    }

    // Sweeper: marca como desistente leads em silêncio prolongado (exceto cobrança)
    for (const raw of (campanhas ?? []) as CampaignRow[]) {
      if (raw.type === "cobranca") continue
      const dias = (raw as unknown as { desistance_silence_days: number }).desistance_silence_days ?? 7
      const corte = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000).toISOString()
      await supabase
        .from("leads_campanha")
        .update({
          state: "desistente",
          exit_reason: "silencio",
          closed_at: agora.toISOString(),
        })
        .eq("campaign_id", raw.id)
        .eq("state", "ativo")
        .lt("last_contact_at", corte)
        .not("last_contact_at", "is", null)
    }

    for (const raw of (campanhas ?? []) as CampaignRow[]) {
      // Δ 2026-09-17 (Theus): freio de mão do tenant vem antes de tudo.
      if (pausados.has(raw.tenant_id)) {
        resultados.push({ campaign: raw.id, skipped: "envios_pausados" })
        continue
      }

      // Indicação não passa por este pipeline — entra via cupom no chat
      // (chat/actions.ts processarCupomIndicacao insere campaign_lead direto).
      if (raw.type === "indicacao") {
        resultados.push({ campaign: raw.id, skipped: "indicacao_via_cupom" })
        continue
      }

      // Δ 2026-09-14: `starts_at` era gravado pelo wizard e nunca lido aqui — a
      // campanha ativada antes da data programada já inscrevia e disparava.
      if (raw.starts_at && new Date(raw.starts_at) > agora) {
        resultados.push({ campaign: raw.id, skipped: "antes_do_inicio" })
        continue
      }

      // encerrar campanhas com prazo expirado
      if (raw.ends_at && new Date(raw.ends_at) < agora) {
        await supabase.from("campanhas").update({ status: 'finalizada' }).eq("id", raw.id)
        resultados.push({ campaign: raw.id, skipped: "expired" })
        continue
      }

      // 1. ENROLL — independente de janela/throttle.
      // Pega todos elegíveis (eligibility já exclui quem está em outro campaign_lead ativo).
      const elegíveis = raw.type === "cobranca"
        ? await getEligibleLeadsCobranca(supabase, raw)
        : await getEligibleLeads(supabase, raw)

      const enrollados = await enrollarLeads(
        supabase,
        raw.id,
        elegíveis,
        { description: raw.description ?? "", response_actions: raw.response_actions ?? [] },
      )

      // 2. AGENDAR DISPAROS — só dentro da janela e até o cap do throttle.
      let disparados = 0
      let skipped: string | null = null
      if (!dentroDeJanela({ ...raw, campaign_id: raw.id }, agora)) {
        skipped = "fora_janela"
      } else {
        const slots = await slotsRestantes(
          supabase,
          { ...raw, campaign_id: raw.id },
          agora,
          campanhasPorTenant.get(raw.tenant_id) ?? [raw.id],
        )
        if (slots <= 0) {
          skipped = "throttle"
        } else {
          // Pega aguardando ainda sem scheduled_action pendente, até `slots`
          const { data: aguardando } = await supabase
            .from("leads_campanha")
            .select("id, lead_id")
            .eq("campaign_id", raw.id)
            .eq("state", "ativo")
            .eq("phase", "aguardando")
            .order("entered_at", { ascending: true })
            .limit(slots)
          const lista = (aguardando ?? []) as Array<{ id: string; lead_id: string }>
          if (lista.length > 0) {
            // Filtra os que NÃO têm scheduled_action pendente
            const ids = lista.map((c) => c.id)
            // Δ 2026-09-12 (⑦): em lotes — com o cap de 1000 slots essa lista de
            // ids passava de 35KB de URL e voltava HTTP 400 do gateway.
            const jaAgendados = await consultarEmLotes<{ carga: Record<string, unknown> | null }>(
              ids,
              (lote) => supabase
                .from("acoes_agendadas")
                .select("carga")
                .eq("status", "pendente")
                .eq("action_type", "campaign_trigger")
                .in("carga->>campaign_lead_id", lote),
            )
            const idsAgendados = new Set(
              jaAgendados
                .map((r) => r.carga?.campaign_lead_id as string | undefined)
                .filter((x): x is string => Boolean(x)),
            )
            const aAgendar = lista.filter((c) => !idsAgendados.has(c.id))
            if (aAgendar.length > 0) {
              disparados = await agendarDisparos(supabase, raw.id, raw.tenant_id, aAgendar)
            }
          }
        }
      }
      totalDisparado += disparados
      resultados.push({
        campaign: raw.id,
        elegiveis: elegíveis.length,
        enrollados: enrollados.length,
        disparados,
        ...(skipped ? { skipped } : {}),
      })
    }

    return new Response(
      JSON.stringify({ totalDisparado, resultados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
