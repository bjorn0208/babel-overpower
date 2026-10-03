import { strict as assert } from "node:assert";
import { quebrarEmBolhas } from "../functions/_shared/bolhas.ts";

// 5 parágrafos separados por linha em branco → 5 bolhas (PROVA: sem cap hardcoded)
const cinco = quebrarEmBolhas(
  "Oi, tudo bem?\n\nVi sua mensagem.\n\nDeixa eu te explicar.\n\nÉ rápido.\n\nPosso seguir?",
);
assert.equal(cinco.silenciar, false);
assert.equal(cinco.bolhas.length, 5);
assert.equal(cinco.bolhas[0], "Oi, tudo bem?");
assert.equal(cinco.bolhas[4], "Posso seguir?");

// [silencio] → silenciar true, zero bolhas
const sil = quebrarEmBolhas("[silencio]");
assert.equal(sil.silenciar, true);
assert.equal(sil.bolhas.length, 0);

// variações de no-reply com espaços/caixa → silenciar true
assert.equal(quebrarEmBolhas("  [ SILENCIO ] ").silenciar, true);
assert.equal(quebrarEmBolhas("[no-reply]").silenciar, true);
assert.equal(quebrarEmBolhas("[no_reply]").silenciar, true);

// texto sem linha em branco → 1 bolha
const uma = quebrarEmBolhas("só uma frase aqui");
assert.equal(uma.silenciar, false);
assert.equal(uma.bolhas.length, 1);
assert.equal(uma.bolhas[0], "só uma frase aqui");

// comportamento <= 3 preservado (não regride)
const tres = quebrarEmBolhas("a\n\nb\n\nc");
assert.deepEqual(tres.bolhas, ["a", "b", "c"]);

// múltiplas linhas em branco + espaços → trim, sem bolha vazia
const sujo = quebrarEmBolhas("primeira\n\n\n  \n\nsegunda\n\n   ");
assert.equal(sujo.bolhas.length, 2);
assert.deepEqual(sujo.bolhas, ["primeira", "segunda"]);

// fallback: string com espaços ao redor mas sem separador → 1 bolha trimada
const fb = quebrarEmBolhas("   conteúdo único   ");
assert.equal(fb.bolhas.length, 1);
assert.equal(fb.bolhas[0], "conteúdo único");

// "[silencio]" no meio do texto NÃO silencia (só quando é a resposta inteira)
const meio = quebrarEmBolhas("vou verificar [silencio] e te aviso");
assert.equal(meio.silenciar, false);
assert.equal(meio.bolhas.length, 1);

console.log("bolhas: OK");
