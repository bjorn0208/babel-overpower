import { strict as assert } from "node:assert";
import { normalizarCategoriaMemoria } from "../functions/cron-destilar-memoria/categoria.ts";

// As 5 categorias do CHECK lead_memory_categoria_check
assert.equal(normalizarCategoriaMemoria("fato_financeiro"), "fato_financeiro");
assert.equal(normalizarCategoriaMemoria("fato_biografico"), "fato_biografico");
assert.equal(normalizarCategoriaMemoria("objecao"), "objecao");
assert.equal(normalizarCategoriaMemoria("interesse"), "interesse");
assert.equal(normalizarCategoriaMemoria("historico_negociacao"), "historico_negociacao");

// Apelidos da Gemma → categoria válida
assert.equal(normalizarCategoriaMemoria("financeiro"), "fato_financeiro");
assert.equal(normalizarCategoriaMemoria("demografico"), "fato_biografico");
assert.equal(normalizarCategoriaMemoria("profissional"), "fato_biografico");
assert.equal(normalizarCategoriaMemoria("familia"), "fato_biografico");
assert.equal(normalizarCategoriaMemoria("dor"), "objecao");
assert.equal(normalizarCategoriaMemoria("objetivo"), "interesse");
assert.equal(normalizarCategoriaMemoria("preferencia"), "interesse");

// Fallback seguro
assert.equal(normalizarCategoriaMemoria("outro"), "interesse");
assert.equal(normalizarCategoriaMemoria(null), "interesse");
assert.equal(normalizarCategoriaMemoria("LIXO_DESCONHECIDO"), "interesse");
assert.equal(normalizarCategoriaMemoria("  Financeiro  "), "fato_financeiro");

console.log("categoria-memoria: 17/17 OK");
