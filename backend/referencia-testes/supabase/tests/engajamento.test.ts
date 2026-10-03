import { strict as assert } from "node:assert";
import { calcularEngajamento } from "../functions/_shared/engajamento.ts";

// score alto + subiu vs anterior
const a = calcularEngajamento({ scoreLead: 90, comprimentoMedio: 120, pontuacaoAnterior: 0.5 });
assert.equal(a.pontuacao, 0.9);
assert.equal(a.nivel, "quente");
assert.equal(a.tendencia, "subindo");
assert.equal(a.comprimento_medio, 120);

// score baixo + caiu
const b = calcularEngajamento({ scoreLead: 30, comprimentoMedio: 40.7, pontuacaoAnterior: 0.8 });
assert.equal(b.pontuacao, 0.3);
assert.equal(b.nivel, "frio");
assert.equal(b.tendencia, "caindo");
assert.equal(b.comprimento_medio, 41); // arredonda

// faixa morna + estável (variação < 0.05)
const c = calcularEngajamento({ scoreLead: 55, comprimentoMedio: 60, pontuacaoAnterior: 0.55 });
assert.equal(c.nivel, "morno");
assert.equal(c.tendencia, "estavel");

// clamp + sem anterior = estável
const d = calcularEngajamento({ scoreLead: 200, comprimentoMedio: 0, pontuacaoAnterior: null });
assert.equal(d.pontuacao, 1);
assert.equal(d.tendencia, "estavel");

// score negativo/NaN → 0 / frio
const e = calcularEngajamento({ scoreLead: Number.NaN, comprimentoMedio: -5, pontuacaoAnterior: null });
assert.equal(e.pontuacao, 0);
assert.equal(e.nivel, "frio");
assert.equal(e.comprimento_medio, 0);

// limites de faixa exatos: 0.7 = quente, 0.4 = morno
assert.equal(calcularEngajamento({ scoreLead: 70, comprimentoMedio: 0, pontuacaoAnterior: null }).nivel, "quente");
assert.equal(calcularEngajamento({ scoreLead: 40, comprimentoMedio: 0, pontuacaoAnterior: null }).nivel, "morno");
assert.equal(calcularEngajamento({ scoreLead: 39, comprimentoMedio: 0, pontuacaoAnterior: null }).nivel, "frio");

console.log("engajamento: OK");
