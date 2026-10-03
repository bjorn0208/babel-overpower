// Parte pura das tools de campanha — sem rede. TZ=UTC npx tsx supabase/tests/tools-campanha.test.ts
import { strict as assert } from "node:assert";
import { criteriosDosArgs, descreverCriterios, montarProposta, textoDoCartao, resumirResultadoTool } from "../functions/_shared/tools-campanha.ts";

// a) args do LLM viram critérios limpos (lixo fora, números inteiros, listas)
const c = criteriosDosArgs({ tags: [{ chave: "produto_identificado", valor: "piso" }, { chave: "", valor: "x" }], temperatura: "frio", dias_calado_min: "15.7", comprou: false, limite: 99999 });
assert.deepEqual(c.tags, [{ chave: "produto_identificado", valor: "piso" }]);
assert.deepEqual(c.temperatura, ["frio"]);
assert.equal(c.dias_calado_min, 15);
assert.equal(c.comprou, false);
assert.equal(c.limite, 2000);

// b) descrição em pt-BR
const d = descreverCriterios(c, "reclamou do preço");
assert.ok(d.includes("produto_identificado = piso"));
assert.ok(d.includes("calados há 15+ dias"));
assert.ok(d.includes("não compraram"));
assert.ok(d.includes('parecidos com "reclamou do preço"'));
assert.equal(descreverCriterios({}), "todos os leads da Base");

// c) proposta com padrões da casa
const p = montarProposta({ nome: "Reativação piso", tipo: "venda", oferta: "10% até sexta", throttle_per_hour: 999 }, ["a", "b", "c"], "piso, calados 15+");
assert.equal(p.window_start, "09:00");
assert.equal(p.throttle_per_hour, 200);
assert.deepEqual(p.weekdays, [1, 2, 3, 4, 5]);
assert.equal(p.lead_ids.length, 3);
const cartao = textoDoCartao(p);
assert.ok(cartao.includes("3 lead(s)"));
assert.ok(cartao.includes("10% até sexta"));
assert.ok(cartao.includes("seg–sex 09:00–18:00"));
assert.ok(cartao.includes('Responda "ok"'));

// d) tipo inválido cai em venda
assert.equal(montarProposta({ tipo: "cobranca" }, ["a"], "x").tipo, "venda");

// e) resumo do resultado guarda ids (até 500) e ignora tool sem dados
const res = resumirResultadoTool("montar_publico", JSON.stringify({ ok: true, dados: { tipo: "publico_campanha", total: 3, lead_ids: ["1", "2", "3"], descricao: "d" } }));
assert.deepEqual(res?.lead_ids, ["1", "2", "3"]);
assert.equal(res?.total, 3);
assert.equal(resumirResultadoTool("abrir_app", "texto solto"), null);
const muitos = resumirResultadoTool("x", JSON.stringify({ dados: { lead_ids: Array.from({ length: 900 }, (_, i) => String(i)) } }));
assert.equal((muitos?.lead_ids as string[]).length, 500);

console.log("tools-campanha.test.ts OK — 5 casos passaram.");
