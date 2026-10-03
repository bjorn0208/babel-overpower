// Resolvedor de critérios do Mentor de Disparo — estende (não substitui) o
// resolvedor de campanha (`processar-campanhas/eligibility.ts`), que só
// entende tag (`eq`/`in` contra `leads.tags[]`). As chaves canônicas abaixo
// (`desfecho`, `dias_sem_resposta`, `mes_entrada`, `mes_desfecho`) são
// colunas reais de `leads` — não tag — resolvidas direto via query builder
// (mesmo padrão seguro de `eligibility.ts`, sem SQL dinâmico).
//
// Usado por: edge `resolver-lista-disparo` (preview de contagem/lista pro
// frontend do Mentor) e `processar-disparos-lead` (resolução real na hora
// do envio).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

export type OperadorCriterioLead = "eq" | "in" | "gte" | "lte"

export interface CriterioLead {
  chave: string
  operador: OperadorCriterioLead
  valor?: string | number
  valores?: string[]
}

export type ModoPublicoLead = "todos" | "segmento" | "lead_ids"

export interface ParametrosResolucaoLead {
  tenantId: string
  modo: ModoPublicoLead
  operadorGlobal: "AND" | "OR"
  criterios: CriterioLead[]
  leadIds?: string[]
  /** lead = nunca converteu · cliente = já converteu · ambos = não filtra (default) */
  publico?: "lead" | "cliente" | "ambos"
}

const CHAVES_CANONICAS = new Set(["desfecho", "dias_sem_resposta", "mes_entrada", "mes_desfecho"])

/**
 * Resolve os IDs de lead elegíveis pro Mentor de Disparo. Sempre exclui
 * opt-out (`leads.opt_out_at` + `exclusoes_tenant`) — guardrail que não é
 * opcional, vale tanto pro preview de contagem quanto pro envio real.
 */
export async function resolverLeadsDisparo(sb: Sb, p: ParametrosResolucaoLead): Promise<string[]> {
  if (p.modo === "lead_ids") {
    const ids = p.leadIds ?? []
    if (ids.length === 0) return []
    // Nunca confiar em leadIds vindo do cliente sem revalidar posse — outro
    // tenant poderia mandar UUID de lead alheio (cross-tenant leak/abuso).
    const { data, error } = await sb.from("leads").select("id").eq("tenant_id", p.tenantId).in("id", ids)
    if (error) throw new Error(error.message)
    const validos = ((data ?? []) as Array<{ id: string }>).map((l) => l.id)
    if (validos.length === 0) return []
    return excluirOptOut(sb, p.tenantId, validos)
  }

  let query = sb
    .from("leads")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .is("deleted_at", null)
    .is("opt_out_at", null)
    .eq("location", "base")

  const publico = p.publico ?? "ambos"
  if (publico === "lead") query = query.is("converted_at", null)
  else if (publico === "cliente") query = query.not("converted_at", "is", null)

  if (p.modo === "segmento" && p.criterios.length > 0) {
    const canonicos = p.criterios.filter((c) => CHAVES_CANONICAS.has(c.chave))
    const tags = p.criterios.filter((c) => !CHAVES_CANONICAS.has(c.chave))

    // Canônicos sempre em AND entre si — cada um filtra uma coluna
    // diferente, combinar em OR não tem leitura natural nesse conjunto.
    for (const c of canonicos) {
      query = aplicarCriterioCanonico(query, c)
    }

    if (tags.length > 0) {
      const tagsArrays = tags
        .map((c) => {
          const valores = Array.isArray(c.valores) ? c.valores : c.valor !== undefined ? [String(c.valor)] : []
          return valores.map((v) => `${c.chave}:${v}`)
        })
        .filter((arr) => arr.length > 0)

      if (p.operadorGlobal === "OR") {
        query = query.overlaps("tags", tagsArrays.flat())
      } else {
        for (const grupo of tagsArrays) query = query.contains("tags", grupo)
      }
    }
  }

  const { data, error } = await query.limit(5000)
  if (error) throw new Error(error.message)
  const ids = ((data ?? []) as Array<{ id: string }>).map((l) => l.id)
  if (ids.length === 0) return []
  return excluirOptOut(sb, p.tenantId, ids)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aplicarCriterioCanonico(query: any, c: CriterioLead) {
  if (c.chave === "desfecho") {
    if (c.operador === "eq" && c.valor) return query.eq("desfecho", c.valor)
    if (c.operador === "in" && c.valores?.length) return query.in("desfecho", c.valores)
    return query
  }

  if (c.chave === "dias_sem_resposta") {
    const dias = Number(c.valor)
    if (!Number.isFinite(dias) || dias < 0) return query
    const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
    if (c.operador === "gte") {
      // "N dias ou mais sem resposta" — inclui quem nunca respondeu.
      return query.or(`ultima_resposta_lead_em.lt.${corte},ultima_resposta_lead_em.is.null`)
    }
    if (c.operador === "lte") {
      return query.gte("ultima_resposta_lead_em", corte)
    }
    return query
  }

  if (c.chave === "mes_entrada" || c.chave === "mes_desfecho") {
    const campo = c.chave === "mes_entrada" ? "created_at" : "desfecho_em"
    const mes = String(c.valor ?? "")
    if (!/^\d{4}-\d{2}$/.test(mes)) return query
    const [ano, mesNum] = mes.split("-").map(Number)
    const inicio = new Date(Date.UTC(ano, mesNum - 1, 1)).toISOString()
    const fim = new Date(Date.UTC(mesNum === 12 ? ano + 1 : ano, mesNum === 12 ? 0 : mesNum, 1)).toISOString()
    return query.gte(campo, inicio).lt(campo, fim)
  }

  return query
}

async function excluirOptOut(sb: Sb, tenantId: string, ids: string[]): Promise<string[]> {
  const { data: optOuts } = await sb
    .from("exclusoes_tenant")
    .select("lead_id")
    .eq("tenant_id", tenantId)
    .in("lead_id", ids)
  const bloqueados = new Set<string>((optOuts ?? []).map((o: { lead_id: string }) => o.lead_id))
  return ids.filter((id) => !bloqueados.has(id))
}
