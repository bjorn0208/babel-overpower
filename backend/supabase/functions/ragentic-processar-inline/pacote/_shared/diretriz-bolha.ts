// _shared/diretriz-bolha.ts
// Seleção RAG-first da diretriz de bolha por turno (busca_hibrida_diretriz_bolha,
// multi-escopo). Extraído para `_shared/` pra ser testável isolado (DI opcional)
// e plugado no motor `ragentic-processar-inline` sem reabrir lógica de fluxo.
//
// Padrão de DI/import dinâmico: idêntico a `_shared/recall-memoria.ts`.
// O embedding (Voyage voyage-4, 1024d, query) é gerado via
// `gerarEmbeddingQuery` de `./tools-internas.ts`, carregado lazily só quando
// `deps.gerarEmbedding` não é injetado (testabilidade sem Deno/fetch real).
//
// Fallback em cascata (fail-safe — motor crítico, todos os tenants):
//   1. RPC `busca_hibrida_diretriz_bolha` com embedding do turno.
//   2. Query direta `tag_sempre_ativo=true`, precedência tenant > nicho > global.
//   3. Qualquer exceção não tratada → `null` (motor mantém a instrução fixa atual).

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export type DiretrizBolha = {
  quantidade_sugerida: string;
  chars_medio_sugerido: number;
  motivo: string;
  contexto: string;
  escopo: string;
} | null;

// Injeção de dependência opcional (testabilidade isolada sem Deno/fetch real).
// Em produção fica o default = import real de tools-internas → comportamento
// idêntico ao inline.
export type DiretrizBolhaDeps = {
  // deno-lint-ignore no-explicit-any
  gerarEmbedding?: (texto: string) => Promise<number[] | null>;
};

// Precedência de escopo para o fallback tag_sempre_ativo.
function _ordemEscopo(escopo: string): number {
  if (escopo === "tenant") return 0;
  if (escopo === "nicho") return 1;
  return 2; // global
}

/**
 * Seleciona a diretriz de bolha mais relevante pro turno atual usando
 * RAG vetorial (`busca_hibrida_diretriz_bolha`) com fallback para
 * `tag_sempre_ativo=true` (precedência tenant > nicho > global).
 *
 * Retorna `null` em caso de falha total → motor mantém a instrução fixa.
 */
export async function selecionarDiretrizBolha(
  sb: AnyClient,
  args: { tenantId: string; nichoId: string | null; queryText: string },
  deps?: DiretrizBolhaDeps,
): Promise<DiretrizBolha> {
  try {
    // Passo 1: queryText vazio/curto → vai direto ao fallback (sem embedding)
    const textoTrimado = (args.queryText ?? "").trim();
    if (textoTrimado.length < 3) {
      return await _fallbackTagSempreAtivo(sb, args);
    }

    // Passo 2: gerar embedding do turno
    const gerarEmbedding = deps?.gerarEmbedding ??
      (async (texto: string) => {
        const { gerarEmbeddingQuery } = await import("./tools-internas.ts");
        return gerarEmbeddingQuery(sb, texto);
      });

    const embedding = await gerarEmbedding(textoTrimado.slice(0, 4000));
    if (!embedding) {
      return await _fallbackTagSempreAtivo(sb, args);
    }

    // Passo 3: chamar RPC busca_hibrida_diretriz_bolha
    const { data, error } = await sb.rpc("busca_hibrida_diretriz_bolha", {
      p_query_text: textoTrimado,
      p_query_embedding: embedding,
      p_tenant_id: args.tenantId,
      p_nicho_id: args.nichoId,
      p_top_k: 3,
    });

    if (error) {
      console.warn("[diretriz-bolha] rpc error:", (error as Error)?.message ?? error);
      return await _fallbackTagSempreAtivo(sb, args);
    }

    // deno-lint-ignore no-explicit-any
    const lista: any[] = (data as any[]) ?? [];
    if (lista.length > 0) {
      const item = lista[0];
      return {
        quantidade_sugerida: String(item.quantidade_sugerida ?? ""),
        chars_medio_sugerido: Number(item.chars_medio_sugerido ?? 0),
        motivo: String(item.motivo ?? ""),
        contexto: String(item.contexto ?? ""),
        escopo: String(item.escopo ?? "global"),
      };
    }

    // RPC vazia → fallback
    return await _fallbackTagSempreAtivo(sb, args);
  } catch (e) {
    // Passo 5: qualquer exceção não tratada → null (fail-safe)
    console.warn("[diretriz-bolha] erro inesperado:", (e as Error)?.message ?? e);
    return null;
  }
}

// Passo 4: fallback determinístico via tag_sempre_ativo.
// Busca todas as diretrizes aplicáveis (tenant + nicho + global) e escolhe
// a mais específica em JS (tenant > nicho > global).
async function _fallbackTagSempreAtivo(
  sb: AnyClient,
  args: { tenantId: string; nichoId: string | null },
): Promise<DiretrizBolha> {
  try {
    const orFiltro = args.nichoId
      ? `tenant_id.eq.${args.tenantId},nicho_id.eq.${args.nichoId},escopo.eq.global`
      : `tenant_id.eq.${args.tenantId},escopo.eq.global`;

    const { data } = await sb
      .from("diretriz_bolha_blocos")
      .select("quantidade_sugerida,chars_medio_sugerido,motivo,contexto,escopo")
      .eq("ativo", true)
      .eq("tag_sempre_ativo", true)
      .or(orFiltro)
      .limit(10);

    // deno-lint-ignore no-explicit-any
    const lista: any[] = (data as any[]) ?? [];
    if (lista.length === 0) return null;

    // Ordenar em JS: tenant(0) < nicho(1) < global(2)
    lista.sort((a, b) => _ordemEscopo(a.escopo) - _ordemEscopo(b.escopo));

    const item = lista[0];
    return {
      quantidade_sugerida: String(item.quantidade_sugerida ?? ""),
      chars_medio_sugerido: Number(item.chars_medio_sugerido ?? 0),
      motivo: String(item.motivo ?? ""),
      contexto: String(item.contexto ?? ""),
      escopo: String(item.escopo ?? "global"),
    };
  } catch (e) {
    console.warn("[diretriz-bolha fallback]", (e as Error)?.message ?? e);
    return null;
  }
}
