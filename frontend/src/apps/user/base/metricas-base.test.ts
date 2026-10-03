import { describe, it, expect } from "vitest";
import { normalizarMetricasBase, type MetricasBase } from "./metricas-base";

describe("normalizarMetricasBase", () => {
  it("normaliza retorno completo da RPC metricas_base", () => {
    const raw = {
      total: 1200,
      leads: 1100,
      clientes: 100,
      produto_mais_vendido: "Limpa Nome",
      distribuicao_tags: { quente: 30, frio: 12 },
      distribuicao_temporal_meses: { "2026-05": 200, "2026-04": 80 },
      total_consumido_clientes: 4500.5,
    };
    const m: MetricasBase = normalizarMetricasBase(raw);
    expect(m.total).toBe(1200);
    expect(m.leads).toBe(1100);
    expect(m.clientes).toBe(100);
    expect(m.produtoMaisVendido).toBe("Limpa Nome");
    expect(m.totalConsumidoClientes).toBe(4500.5);
    expect(m.tags).toEqual([
      { tag: "quente", qtd: 30 },
      { tag: "frio", qtd: 12 },
    ]);
  });

  it("defaults seguros quando raw é null/incompleto", () => {
    const m = normalizarMetricasBase(null);
    expect(m).toEqual({
      total: 0, leads: 0, clientes: 0,
      produtoMaisVendido: null, totalConsumidoClientes: 0, tags: [],
    });
    const p = normalizarMetricasBase({ total: 5 });
    expect(p.total).toBe(5);
    expect(p.clientes).toBe(0);
    expect(p.tags).toEqual([]);
  });

  it("tags ordenadas por qtd desc", () => {
    const m = normalizarMetricasBase({ distribuicao_tags: { a: 2, b: 9, c: 5 } });
    expect(m.tags.map((t) => t.tag)).toEqual(["b", "c", "a"]);
  });
});
