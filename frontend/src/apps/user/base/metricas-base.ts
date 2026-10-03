/**
 * Normaliza o retorno da RPC `metricas_base(p_tenant_id)` num tipo seguro
 * pra UI do app Base. A RPC lê `leads WHERE location='base'` e devolve o
 * "valor total" dos contatos arquivados/concluídos. Onda 2026-05-16 (3.1).
 */
export interface TagMetrica {
  tag: string;
  qtd: number;
}

export interface MetricasBase {
  total: number;
  leads: number;
  clientes: number;
  produtoMaisVendido: string | null;
  totalConsumidoClientes: number;
  tags: TagMetrica[];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalizarMetricasBase(raw: unknown): MetricasBase {
  const r = (raw ?? {}) as Record<string, unknown>;
  const distTags = (r.distribuicao_tags ?? {}) as Record<string, unknown>;
  const tags: TagMetrica[] = Object.entries(distTags)
    .map(([tag, qtd]) => ({ tag, qtd: num(qtd) }))
    .sort((a, b) => b.qtd - a.qtd);
  return {
    total: num(r.total),
    leads: num(r.leads),
    clientes: num(r.clientes),
    produtoMaisVendido:
      typeof r.produto_mais_vendido === "string" && r.produto_mais_vendido.length > 0
        ? r.produto_mais_vendido
        : null,
    totalConsumidoClientes: num(r.total_consumido_clientes),
    tags,
  };
}
