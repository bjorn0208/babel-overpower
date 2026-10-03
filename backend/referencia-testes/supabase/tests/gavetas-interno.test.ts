// Testa a formatação das gavetas do canal interno sem rede nem Deno.
// Rodar: TZ=UTC npx tsx supabase/tests/gavetas-interno.test.ts
import { strict as assert } from "node:assert";
import { formatarGavetas } from "../functions/_shared/gavetas-interno.ts";

// a) procedimento vira bloco XML com título e passos
const comProcedimento = formatarGavetas({
  procedurais: [{ id: "p1", titulo: "Criar campanha", passos: "1. abrir app\n2. escolher leads" }],
  conhecimento: [],
});
assert.ok(comProcedimento.includes("<procedimentos_da_casa>"));
assert.ok(comProcedimento.includes("Criar campanha"));
assert.ok(comProcedimento.includes("1. abrir app"));

// b) conhecimento vira bloco próprio com rótulo de origem
const comConhecimento = formatarGavetas({
  procedurais: [],
  conhecimento: [{ id: "c1", title: "Preço do plano", content: "R$ 497 à vista" }],
});
assert.ok(comConhecimento.includes("<conhecimento_da_empresa>"));
assert.ok(comConhecimento.includes("R$ 497"));
assert.ok(!comConhecimento.includes("<procedimentos_da_casa>"));

// c) nada recuperado → string vazia, sem tag órfã
assert.equal(formatarGavetas({ procedurais: [], conhecimento: [] }), "");

// d) bloco gigante é cortado — não pode dominar o prompt
const longo = "x".repeat(5000);
const cortado = formatarGavetas({ procedurais: [], conhecimento: [{ id: "c2", title: "T", content: longo }] });
assert.ok(cortado.length < 1000);
assert.ok(cortado.includes("…"));

console.log("gavetas-interno.test.ts OK — 4 casos passaram.");
