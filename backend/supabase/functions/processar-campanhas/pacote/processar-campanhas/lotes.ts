/**
 * Quebra de listas de id em lotes pra consulta PostgREST.
 *
 * Por quê (2026-09-12): `.in("id", ids)` vira query string num GET. Medido
 * contra a nossa própria API: 500 UUIDs (~18KB) passam, 800 (~28KB) já voltam
 * HTTP 400 — o gateway corta antes do Postgres ver qualquer coisa. A campanha
 * do Otmar tem 2.259 leads em `filters.lead_ids` (~84KB): ia estourar no
 * primeiro ciclo, e como o erro sobe até o try/catch do `Deno.serve`, derrubaria
 * junto o processamento das campanhas de TODOS os outros tenants.
 *
 * O limite não vale só pro modo `lead_ids`: qualquer campanha com mais de ~600
 * elegíveis batia nele nas consultas seguintes (`leads_campanha`,
 * `exclusoes_tenant`), que recebem até 1000 ids.
 *
 * 300 dá margem folgada (~11KB) e mantém o número de idas ao banco baixo.
 */
export const LOTE_IDS = 300

export function emLotes<T>(itens: readonly T[], tamanho = LOTE_IDS): T[][] {
  if (itens.length <= tamanho) return itens.length === 0 ? [] : [[...itens]]
  const saida: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) saida.push(itens.slice(i, i + tamanho))
  return saida
}

/**
 * Roda a mesma consulta uma vez por lote de ids e junta as linhas.
 * `montar` recebe o lote e devolve a promise da consulta já pronta.
 */
export async function consultarEmLotes<T>(
  ids: readonly string[],
  montar: (lote: string[]) => PromiseLike<{ data: T[] | null; error?: unknown }>,
): Promise<T[]> {
  const saida: T[] = []
  for (const lote of emLotes(ids)) {
    const { data } = await montar(lote)
    if (data) saida.push(...data)
  }
  return saida
}
