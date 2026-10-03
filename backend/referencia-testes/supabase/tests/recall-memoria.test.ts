import { strict as assert } from "node:assert";
import {
  recuperarMemoriaLead,
  resolverEntidadePorNome,
} from "../functions/_shared/recall-memoria.ts";

// Fake .rpc (recuperarMemoriaLead): registra chamadas, devolve respostas fixas.
function fakeSupabase(respostas: Record<string, { data: unknown }>) {
  const chamadas: Array<{ fn: string; args: unknown }> = [];
  return {
    chamadas,
    // deno-lint-ignore no-explicit-any
    rpc(fn: string, args: any) {
      chamadas.push({ fn, args });
      return Promise.resolve(respostas[fn] ?? { data: null });
    },
  };
}
const depsEmb = (v: number[] | null) => ({ gerarEmbeddingQuery: () => Promise.resolve(v) });

// Fake query builder chainable + thenable (resolverEntidadePorNome).
function fakeQueryClient(data: unknown) {
  const filtros: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "is", "or", "limit"]) {
    builder[m] = (...a: unknown[]) => {
      filtros[m] = a.length === 1 ? a[0] : a;
      return builder;
    };
  }
  // deno-lint-ignore no-explicit-any
  (builder as any).then = (res: (v: unknown) => void) => res({ data });
  return { builder, filtros };
}

async function main() {
  // ── recuperarMemoriaLead ──────────────────────────────────────────────────
  // 1. sem leadId → vazio, nenhuma RPC
  {
    const sb = fakeSupabase({});
    const r = await recuperarMemoriaLead(sb, { leadId: null, tenantId: "t1", queryRecall: "oi" }, depsEmb([0.1]));
    assert.deepEqual(r, { fatosLead: [], episodios: [] });
    assert.equal(sb.chamadas.length, 0);
  }
  // 2. embedding null → não chama RPC
  {
    const sb = fakeSupabase({});
    const r = await recuperarMemoriaLead(sb, { leadId: "L1", tenantId: "t1", queryRecall: "oi" }, depsEmb(null));
    assert.deepEqual(r, { fatosLead: [], episodios: [] });
    assert.equal(sb.chamadas.length, 0);
  }
  // 3. caminho feliz → 2 RPCs com params idênticos ao inline original
  {
    const sb = fakeSupabase({
      busca_hibrida_memoria_lead: { data: [{ fato: "tem orçamento" }] },
      busca_hibrida_memoria_episodica: { data: [{ episodio_resumo: "pediu desconto" }] },
    });
    const r = await recuperarMemoriaLead(sb, { leadId: "L1", tenantId: "T1", queryRecall: "preço" }, depsEmb([0.1, 0.2]));
    assert.equal(r.fatosLead.length, 1);
    assert.equal(r.episodios.length, 1);
    const cL = sb.chamadas.find((c) => c.fn === "busca_hibrida_memoria_lead")!;
    assert.deepEqual(cL.args, { p_lead_id: "L1", p_query_text: "preço", p_query_embedding: [0.1, 0.2], p_match_count: 10, p_tenant_id: "T1" });
    const cE = sb.chamadas.find((c) => c.fn === "busca_hibrida_memoria_episodica")!;
    assert.deepEqual(cE.args, {
      p_tenant_id: "T1",
      p_query_text: "preço",
      p_query_embedding: [0.1, 0.2],
      p_lead_id: "L1",
      p_match_count: 5,
    });
  }
  // 4. RPC lança → fallback silencioso
  {
    const sb = { rpc() { throw new Error("boom"); } };
    const r = await recuperarMemoriaLead(sb, { leadId: "L1", tenantId: "T1", queryRecall: "x" }, depsEmb([0.1]));
    assert.deepEqual(r, { fatosLead: [], episodios: [] });
  }
  // 5. data null → `?? []`
  {
    const sb = fakeSupabase({
      busca_hibrida_memoria_lead: { data: null },
      busca_hibrida_memoria_episodica: { data: null },
    });
    const r = await recuperarMemoriaLead(sb, { leadId: "L1", tenantId: "T1", queryRecall: "x" }, depsEmb([0.1]));
    assert.deepEqual(r, { fatosLead: [], episodios: [] });
  }

  // ── resolverEntidadePorNome ───────────────────────────────────────────────
  // 6. termo curto (<2) → nenhum, sem query
  {
    const { builder } = fakeQueryClient([{ id: "x" }]);
    const r = await resolverEntidadePorNome(builder, { tenantId: "T1", termo: "a" });
    assert.deepEqual(r, { status: "nenhum", entidades: [] });
  }
  // 7. sem tenantId → nenhum
  {
    const { builder } = fakeQueryClient([{ id: "x" }]);
    const r = await resolverEntidadePorNome(builder, { tenantId: "", termo: "André" });
    assert.deepEqual(r, { status: "nenhum", entidades: [] });
  }
  // 8. 0 resultados → nenhum + filtros corretos (tenant, deleted_at, or name/nome_exibicao)
  {
    const { builder, filtros } = fakeQueryClient([]);
    const r = await resolverEntidadePorNome(builder, { tenantId: "T1", termo: "André Marques" });
    assert.equal(r.status, "nenhum");
    assert.equal(filtros.from, "leads");
    assert.deepEqual(filtros.eq, ["tenant_id", "T1"]);
    assert.deepEqual(filtros.is, ["deleted_at", null]);
    assert.equal(filtros.or, "name.ilike.%André Marques%,nome_exibicao.ilike.%André Marques%");
    assert.equal(filtros.limit, 8);
  }
  // 9. 1 resultado → unico
  {
    const { builder } = fakeQueryClient([{ id: "L1", name: "André Marques", nome_exibicao: null, phone: "55..." }]);
    const r = await resolverEntidadePorNome(builder, { tenantId: "T1", termo: "André" });
    assert.equal(r.status, "unico");
    assert.equal(r.entidades.length, 1);
    assert.equal(r.entidades[0].id, "L1");
  }
  // 10. N resultados → ambiguo (lista pro Mentor desambiguar)
  {
    const { builder } = fakeQueryClient([
      { id: "L1", name: "André Marques", nome_exibicao: null, phone: "1" },
      { id: "L2", name: "André M. Silva", nome_exibicao: null, phone: "2" },
    ]);
    const r = await resolverEntidadePorNome(builder, { tenantId: "T1", termo: "André" });
    assert.equal(r.status, "ambiguo");
    assert.equal(r.entidades.length, 2);
  }
  // 11. erro → nenhum (fail-safe)
  {
    const quebrado = { from() { throw new Error("db down"); } };
    const r = await resolverEntidadePorNome(quebrado, { tenantId: "T1", termo: "André" });
    assert.deepEqual(r, { status: "nenhum", entidades: [] });
  }
  // 12. data null → nenhum
  {
    const { builder } = fakeQueryClient(null);
    const r = await resolverEntidadePorNome(builder, { tenantId: "T1", termo: "André" });
    assert.deepEqual(r, { status: "nenhum", entidades: [] });
  }

  console.log("recall-memoria.test.ts OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
