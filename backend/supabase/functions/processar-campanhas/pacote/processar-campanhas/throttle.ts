import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

export type ThrottleConfig = {
  campaign_id: string
  throttle_per_day: number | null
  throttle_per_hour: number | null
  window_start: string
  window_end: string
  weekdays: number[]
  skip_holidays: boolean
}

/** Brasil não tem horário de verão desde 2019 — offset fixo. */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000

export function dentroDeJanela(cfg: ThrottleConfig, agora: Date): boolean {
  // Edge function roda em UTC, mas window_start/end e weekdays são configurados
  // em BRT (UTC-3, Brasil sem DST). Sem essa conversão, janela 09-18h BRT só
  // "abriria" às 12h UTC = 09h BRT no servidor — desvio fixo de 3h.
  const agoraBrt = new Date(agora.getTime() - BRT_OFFSET_MS)

  const diaSemana = agoraBrt.getUTCDay() // 0=dom em BRT, ..., 6=sab

  const [hStart, mStart] = cfg.window_start.split(":").map(Number)
  const [hEnd, mEnd] = cfg.window_end.split(":").map(Number)
  const minutoAtual = agoraBrt.getUTCHours() * 60 + agoraBrt.getUTCMinutes()
  const inicio = hStart * 60 + mStart
  const fim = hEnd * 60 + mEnd

  if (fim > inicio) {
    return cfg.weekdays.includes(diaSemana) && minutoAtual >= inicio && minutoAtual < fim
  }

  // Δ 2026-09-14: janela que vira a meia-noite (ex.: 23:10 → 00:10). Antes a
  // conta `>= inicio && < fim` nunca fechava e a campanha nunca disparava.
  // O dia da semana que vale é o dia em que a janela ABRIU: 00:05 de terça
  // pertence à janela de segunda.
  if (minutoAtual >= inicio) return cfg.weekdays.includes(diaSemana)
  if (minutoAtual < fim) return cfg.weekdays.includes((diaSemana + 6) % 7)
  return false
}

/**
 * Δ 2026-09-12 (④): o dia do teto diário vira à meia-noite de BRASÍLIA.
 * Antes era `new Date(agora); inicioDia.setHours(0,0,0,0)` — e como o runtime
 * da edge function é UTC, isso dava 00h UTC = 21h BRT do dia ANTERIOR. Numa
 * janela 9-18h BRT não aparecia; em qualquer campanha que passasse das 21h, o
 * teto diário virava no meio da noite de trabalho. `dentroDeJanela` logo acima
 * já convertia pra BRT: eram duas noções de "dia" no mesmo arquivo.
 */
function inicioDoDiaBrt(agora: Date): Date {
  const brt = new Date(agora.getTime() - BRT_OFFSET_MS)
  const meiaNoiteBrt = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate())
  return new Date(meiaNoiteBrt + BRT_OFFSET_MS)
}

/**
 * Disparos que JÁ estão na fila (`acoes_agendadas` pendentes) e ainda não
 * viraram `last_contact_at`.
 *
 * Δ 2026-09-12 (①): sem isto o teto vazava. `last_contact_at` só é escrito por
 * `processar-acompanhamentos` DEPOIS que a bolha sai; o cron desta função roda a
 * cada minuto desde 2026-09-15 (antes 10 min) e cada disparo é um turno de LLM. Se o worker atrasasse, o ciclo
 * seguinte via contagem zero e agendava outro lote inteiro — o filtro de "já
 * agendados" do index.ts só protege o MESMO lead, não o teto. Com 15/hora
 * configurado dava pra sair 90 numa hora (6 ciclos × 15). Fila pendente é envio
 * certo: conta como enviado.
 */
async function jaNaFila(sb: SupabaseClient, campaignIds: string[]): Promise<number> {
  if (campaignIds.length === 0) return 0
  const { count } = await sb
    .from("acoes_agendadas")
    .select("id", { count: "exact", head: true })
    .in("status", ["pendente", "processando"])
    .eq("action_type", "campaign_trigger")
    .in("carga->>campaign_id", campaignIds)
  return count ?? 0
}

/**
 * Quantos disparos ainda cabem agora.
 *
 * Δ 2026-09-12 (③): `campaignIds` é o conjunto de campanhas ATIVAS DO MESMO
 * TENANT, não só esta. O teto sempre foi por campanha, então duas campanhas
 * ligadas no mesmo número davam dois tetos independentes — quem configura
 * "15/hora" está falando do WhatsApp dele, não de uma linha de planilha. Agora
 * as campanhas do tenant dividem o mesmo orçamento; a config aplicada é a desta
 * campanha (a mais restritiva ganha naturalmente, porque cada ciclo recalcula).
 */
export async function slotsRestantes(
  sb: SupabaseClient,
  cfg: ThrottleConfig,
  agora: Date,
  campaignIds: string[] = [cfg.campaign_id],
): Promise<number> {
  let restante = Infinity

  const naFila = await jaNaFila(sb, campaignIds)

  if (cfg.throttle_per_day !== null) {
    const inicioDia = inicioDoDiaBrt(agora)
    const { count } = await sb
      .from("leads_campanha")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .gte("last_contact_at", inicioDia.toISOString())
    restante = Math.min(restante, cfg.throttle_per_day - (count ?? 0) - naFila)
  }

  if (cfg.throttle_per_hour !== null) {
    const umaHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000)
    const { count } = await sb
      .from("leads_campanha")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .gte("last_contact_at", umaHoraAtras.toISOString())
    restante = Math.min(restante, cfg.throttle_per_hour - (count ?? 0) - naFila)
  }

  // Sem throttle configurado (ambos null) → cap defensivo de 1000/ciclo evita
  // disparo runaway acidental quando o tenant esquece de configurar limites.
  // O bug anterior retornava 0 e a campanha nunca disparava.
  if (restante === Infinity) return Math.max(0, 1000 - naFila)
  return Math.max(0, restante)
}
