/**
 * Pagina uma query Supabase em janelas de `tamanho` linhas (default 1000)
 * usando `.range(de, ate)` até esgotar. Resolve o limite duro de 1000
 * linhas do PostgREST (problema relatado quando tenants com >1k conversas).
 *
 * Uso:
 *   const linhas = await paginarTudo(() =>
 *     supabase.from("conversas").select("...").eq("tenant_id", uid).order("updated_at", { ascending: false })
 *   , { tamanho: 1000, maxPaginas: 20 });
 *
 * Observações:
 * - A função `criarQuery` é chamada a cada página (cada chamada constrói
 *   uma query nova porque o builder do supabase-js não é reutilizável após
 *   um `range()` ter sido aplicado).
 * - `maxPaginas` evita loop infinito caso a tabela esteja crescendo durante
 *   a leitura (default 30 → 30k linhas, mais que suficiente por tenant).
 */
export async function paginarTudo<T = any>(
  criarQuery: () => any,
  opts: { tamanho?: number; maxPaginas?: number } = {},
): Promise<T[]> {
  const tamanho = Math.max(1, Math.min(1000, opts.tamanho ?? 1000));
  const maxPaginas = Math.max(1, opts.maxPaginas ?? 30);
  const todas: T[] = [];
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const de = pagina * tamanho;
    const ate = de + tamanho - 1;
    const { data, error } = await criarQuery().range(de, ate);
    if (error) {
      console.warn("[paginar] erro:", error.message);
      break;
    }
    const linhas = (data as T[] | null) ?? [];
    todas.push(...linhas);
    if (linhas.length < tamanho) break; // última página
  }
  return todas;
}

/**
 * Faz chunking de `ids` em lotes de `tamanhoLote` (default 100) e chama
 * `fetcher(lote)` em paralelo via Promise.all, agregando os resultados.
 * Resolve o estouro de URL HTTP quando `.in("coluna", [muitos uuids])`
 * tem mais de ~120 UUIDs (URL > 8KB).
 *
 * Uso:
 *   const msgs = await buscarEmLotes(conversaIds, (lote) =>
 *     supabase.from("mensagens").select("...").in("conversation_id", lote)
 *   );
 *
 * Observações:
 * - `fetcher` recebe um lote (subarray de ids) e devolve a Promise da query Supabase.
 * - Erros por lote são logados via `console.warn` (não swallow silencioso) e
 *   o lote vira `[]`, sem interromper os demais.
 */
export async function buscarEmLotes<T = any>(
  ids: string[],
  fetcher: (lote: string[]) => Promise<{ data: T[] | null; error: any }>,
  tamanhoLote = 100,
): Promise<T[]> {
  if (!ids.length) return [];
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += tamanhoLote) {
    lotes.push(ids.slice(i, i + tamanhoLote));
  }
  const resultados = await Promise.all(
    lotes.map(async (lote, idx) => {
      const { data, error } = await fetcher(lote);
      if (error) {
        console.warn(`[buscarEmLotes] lote ${idx + 1}/${lotes.length} falhou:`, error?.message ?? error);
        return [] as T[];
      }
      return (data ?? []) as T[];
    }),
  );
  return resultados.flat();
}