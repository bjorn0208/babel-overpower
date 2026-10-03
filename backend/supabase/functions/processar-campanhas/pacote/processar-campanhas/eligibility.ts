import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { ehCelularBr } from "../_shared/telefone.ts"
import { consultarEmLotes, emLotes } from "./lotes.ts"

// Formato canônico de filtro — gerado pelo wizard novo de campanha
type FiltroCanônico = {
  chave: string
  operador: string
  valor: string | string[]
}

export type Campaign = {
  id: string
  tenant_id: string
  type: string
  product_id: string | null
  filters: {
    // Formato legado (backward compat)
    tags?: string[]
    operator?: "AND" | "OR"
    // Formato canônico (wizard novo) — é ISTO que o Wizard.tsx grava hoje.
    modo?: "todos" | "segmento" | "lead_ids" | "persona"
    criterios?: FiltroCanônico[]
    operador_global?: "AND" | "OR"
    // Legado em inglês. Campanhas antigas ainda têm; o wizard não grava mais.
    mode?: "tags" | "lead_ids" | "persona" | "segmento"
    lead_ids?: string[]
    persona_descricao?: string
    persona_lead_ref_ids?: string[]
    segmento_id?: string
    publico?: "lead" | "cliente" | "ambos"
  }
  duration_mode: "prazo" | "periodica" | "vitalicia"
  starts_at: string
  ends_at: string | null
}

type CampaignSettings = {
  inatividade_valor: number
  inatividade_unidade: "hora" | "dia" | "mes"
}

async function getInatividadeMs(sb: SupabaseClient, tenantId: string): Promise<number> {
  const { data } = await sb.from("profiles").select("campaign_settings").eq("id", tenantId).maybeSingle()
  const s = (data?.campaign_settings as CampaignSettings | null) ?? { inatividade_valor: 1, inatividade_unidade: "dia" }
  const v = s.inatividade_valor
  if (s.inatividade_unidade === "hora") return v * 60 * 60 * 1000
  if (s.inatividade_unidade === "mes") return v * 30 * 24 * 60 * 60 * 1000
  return v * 24 * 60 * 60 * 1000
}

export async function getEligibleLeads(sb: SupabaseClient, c: Campaign): Promise<string[]> {
  const ms = await getInatividadeMs(sb, c.tenant_id)
  const corte = new Date(Date.now() - ms).toISOString()

  // Pool por tipo (Theus 2026-04-30): Base é fonte única.
  // - divulgação/venda/agendamento → location='base' (lead/cliente/ambos via filters.publico)
  // - pos_venda → location='base' AND converted_at NOT NULL (cliente concluído na Base)
  // - cobranca → branch própria getEligibleLeadsCobranca (não cai aqui)
  // - indicacao → skip no index.ts (entra via cupom no chat)
  //
  // Δ 2026-09-12 (⑦): a query é REMONTADA a cada lote — um builder do PostgREST
  // não se reaproveita depois do await, e listas grandes de id precisam ir em
  // pedaços (ver lotes.ts). Por isso virou função em vez de variável.
  //
  // Δ 2026-09-14: `faixa` separa quem já passou da janela de inatividade
  // ("antigos") de quem acabou de subir por planilha e nunca respondeu
  // ("frescos"). A janela existe pra não abordar quem conversou há pouco — lead
  // que só existe porque o dono subiu a planilha não conversou com ninguém, e
  // fazê-lo esperar 1 dia fazia a campanha "não disparar" no dia da subida.
  const montarQuery = (faixa: "antigos" | "frescos" = "antigos") => {
    let query = sb.from("leads").select("id, converted_at, phone")
      .eq("tenant_id", c.tenant_id)
      .is("deleted_at", null)
      .eq("location", "base")

    query = faixa === "antigos"
      ? query.lt("updated_at", corte)
      : query.gte("updated_at", corte).eq("origem_lead", "planilha").is("ultima_resposta_lead_em", null)

    if (c.type === "pos_venda") {
      query = query.not("converted_at", "is", null)
    } else {
      // divulgação / venda / agendamento (indicação não chega aqui)
      const publico = c.filters.publico ?? "ambos"
      if (publico === "lead") query = query.is("converted_at", null)
      else if (publico === "cliente") query = query.not("converted_at", "is", null)
      // ambos: não restringe converted_at
    }

    const temCriteriosNovos = Array.isArray(c.filters.criterios) && c.filters.criterios.length > 0
    const temTagsLegadas = Array.isArray(c.filters.tags) && c.filters.tags.length > 0

    if (temCriteriosNovos) {
      // Formato canônico: criterios + operador_global (wizard novo)
      const criterios = c.filters.criterios as FiltroCanônico[]
      const operadorGlobal = c.filters.operador_global ?? "AND"

      if (operadorGlobal === "OR") {
        const orParts: string[] = criterios.flatMap((crit) => {
          const valores = Array.isArray(crit.valor) ? crit.valor : [crit.valor]
          const tagValues = valores.map((v) => `${crit.chave}:${v}`)
          if (crit.operador === "eq") {
            // contains individual: tags.cs.{chave:valor}
            return tagValues.map((tv) => `tags.cs.{${tv}}`)
          } else if (crit.operador === "in") {
            // overlaps conjunto: tags.ov.{chave:v1,chave:v2}
            return [`tags.ov.{${tagValues.join(",")}}`]
          }
          // gt/lt/ilike: ignorar por ora (requerem parsing de valor numérico)
          return []
        })
        if (orParts.length > 0) query = query.or(orParts.join(","))
      } else {
        // AND: encadear contains/overlaps — Supabase aplica AND implicitamente
        for (const crit of criterios) {
          const valores = Array.isArray(crit.valor) ? crit.valor : [crit.valor]
          const tagValues = valores.map((v) => `${crit.chave}:${v}`)
          if (crit.operador === "eq") {
            // tag exata: leads.tags @> ARRAY['chave:valor']
            query = query.contains("tags", tagValues)
          } else if (crit.operador === "in") {
            // qualquer um dos valores: leads.tags && ARRAY['chave:v1','chave:v2']
            query = query.overlaps("tags", tagValues)
          }
          // gt/lt/ilike: ignorar por ora
        }
      }
    } else if (temTagsLegadas) {
      // Formato legado: tags[] + operator (backward compat)
      query = c.filters.operator === "OR"
        ? query.overlaps("tags", c.filters.tags as string[])
        : query.contains("tags", c.filters.tags as string[])
    }

    if (c.type === "pos_venda" && c.product_id) {
      query = query.eq("product", c.product_id)
    }

    return query
  }

  // Modos B (lead_ids) e C (persona) — lista congelada na criação.
  //
  // Fix 2026-09-08 · lia SÓ `filters.mode` (inglês), mas o wizard grava
  // `filters.modo` (pt-BR — `Wizard.tsx:107`). Resultado: quem escolhia "Lista de
  // IDs" ou "Persona" caía no `else` e, sem `criterios` nem `tags`, levava a
  // campanha pra BASE INTEIRA em vez da lista escolhida. Errar pra mais é o pior
  // jeito de errar aqui. Agora o canônico é `modo`, com `mode` aceito como legado.
  const modoPublico = c.filters.modo ?? c.filters.mode
  const listaCongelada = modoPublico === "lead_ids" || modoPublico === "persona"

  type LinhaLead = { id: string; phone: string | null }

  const buscarFaixa = async (faixa: "antigos" | "frescos"): Promise<LinhaLead[]> => {
    const saida: LinhaLead[] = []
    if (listaCongelada) {
      const idsFiltro = c.filters.lead_ids ?? []
      // Δ 2026-09-12 (⑦): antes era um `.in("id", idsFiltro)` só. Com os 2.259 ids
      // do Otmar a URL passava de 80KB e o gateway devolvia 400 — a campanha nunca
      // rodaria, e o erro derrubava o ciclo das outras.
      for (const lote of emLotes(idsFiltro)) {
        if (saida.length >= 1000) break
        const { data } = await montarQuery(faixa).in("id", lote).limit(1000 - saida.length)
        if (data) saida.push(...(data as LinhaLead[]))
      }
    } else {
      const { data } = await montarQuery(faixa).limit(1000)
      if (data) saida.push(...(data as LinhaLead[]))
    }
    return saida
  }

  if (listaCongelada && (c.filters.lead_ids ?? []).length === 0) return []

  const leadsRaw = await buscarFaixa("antigos")

  // Δ 2026-09-14: "fresco" só vale se nunca houve contato nenhum — nem conversa
  // aberta (o agente pode ter falado primeiro) nem passagem por outra campanha.
  // `ultima_resposta_lead_em` só cobre o que o lead mandou; estas duas cobrem o
  // que a plataforma mandou.
  if (leadsRaw.length < 1000) {
    const candidatos = await buscarFaixa("frescos")
    const idsCandidatos = candidatos.map((l) => l.id)
    if (idsCandidatos.length > 0) {
      const comConversa = await consultarEmLotes<{ lead_id: string }>(idsCandidatos, (lote) =>
        sb.from("conversas").select("lead_id").in("lead_id", lote))
      const jaEmCampanha = await consultarEmLotes<{ lead_id: string }>(idsCandidatos, (lote) =>
        sb.from("leads_campanha").select("lead_id").in("lead_id", lote))
      const tocados = new Set([...comConversa, ...jaEmCampanha].map((r) => r.lead_id))
      const frescos = candidatos.filter((l) => !tocados.has(l.id))
      leadsRaw.push(...frescos.slice(0, 1000 - leadsRaw.length))
    }
  }

  // Δ 2026-09-12 (②): fixo não tem WhatsApp. Planilha de empresa vem cheia deles
  // (379 de 2.573 na base do Otmar) e antes iam todos pra fila — cada um vira
  // erro da Z-API, e erro em sequência queima a reputação do número. O filtro
  // fica AQUI, e não só na importação, porque as bases já subidas precisam ser
  // protegidas sem ninguém ter que reimportar nada.
  const leads = leadsRaw.filter((l) => ehCelularBr(l.phone))
  if (leads.length === 0) return []

  const ids = leads.map((l) => l.id)

  // Δ 2026-09-12 (⑦): estas duas também recebiam até 1000 ids (~37KB) e batiam
  // no mesmo teto de URL — ou seja, QUALQUER campanha com mais de ~600 elegíveis
  // quebrava aqui, não só a do Otmar.
  const ativos = await consultarEmLotes<{ lead_id: string }>(ids, (lote) =>
    sb.from("leads_campanha").select("lead_id").in("lead_id", lote).eq("state", "ativo"))

  const optOuts = await consultarEmLotes<{ lead_id: string }>(ids, (lote) =>
    sb.from("exclusoes_tenant").select("lead_id").eq("tenant_id", c.tenant_id).in("lead_id", lote))

  const bloqueados = new Set<string>([
    ...ativos.map((a) => a.lead_id),
    ...optOuts.map((o) => o.lead_id),
  ])

  return ids.filter((id) => !bloqueados.has(id))
}

export async function getEligibleLeadsCobranca(sb: SupabaseClient, c: Campaign): Promise<string[]> {
  const hoje = new Date().toISOString().slice(0, 10)
  const { data: pagamentos } = await sb
    .from("pagamentos_cliente")
    .select("lead_id")
    .eq("tenant_id", c.tenant_id)
    .eq("status", "pendente")
    .lt("data_vencimento", hoje)

  if (!pagamentos || pagamentos.length === 0) return []

  const ids = [...new Set(pagamentos.map((p) => p.lead_id as string))]

  // Cobrança aceita cliente ativo (location='cliente') OU cliente na Base
  // (location='base' AND converted_at NOT NULL). Cliente em serviço continua
  // recebendo cobrança; lead nunca-cliente NÃO é elegível.
  // Δ 2026-09-12 (⑦): em lotes — a lista de devedores também pode passar do teto de URL.
  const leadsValidos = await consultarEmLotes<{ id: string; phone: string | null }>(ids, (lote) =>
    sb.from("leads")
      .select("id, location, converted_at, phone")
      .in("id", lote)
      .is("deleted_at", null)
      .or("location.eq.cliente,and(location.eq.base,converted_at.not.is.null)"))

  const idsValidos = leadsValidos
    .filter((l) => ehCelularBr(l.phone))   // Δ 2026-09-12 (②): cobrança também não vai pra fixo
    .map((l) => l.id)
  if (idsValidos.length === 0) return []

  const ativos = await consultarEmLotes<{ lead_id: string }>(idsValidos, (lote) =>
    sb.from("leads_campanha").select("lead_id").in("lead_id", lote).eq("state", "ativo"))

  const optOuts = await consultarEmLotes<{ lead_id: string }>(idsValidos, (lote) =>
    sb.from("exclusoes_tenant").select("lead_id").eq("tenant_id", c.tenant_id).in("lead_id", lote))

  const bloqueados = new Set<string>([
    ...ativos.map((a) => a.lead_id),
    ...optOuts.map((o) => o.lead_id),
  ])

  return idsValidos.filter((id) => !bloqueados.has(id))
}
