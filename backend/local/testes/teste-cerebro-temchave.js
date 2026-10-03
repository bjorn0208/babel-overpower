// Regressão TO-DE-LIST-4: a checagem de chave do cérebro não pode lançar.
// `groqKey()` foi removida na migração p/ OpenRouter mas duas chamadas
// ficaram (temChave no perguntar, temGroq exportado) -> ReferenceError que
// quebrava TODA pergunta com login (HTTP 500).
// Uso: node backend/local/testes/teste-cerebro-temchave.js   (exit 0 = verde)
'use strict';
const assert = require('node:assert');
const A = require('../../../nova-frontend-babel/cerebro/assistente');
assert.strictEqual(typeof A.temGroq(), 'boolean', 'temGroq deve devolver boolean sem lançar');
assert.doesNotThrow(() => A.info(), 'info() não pode lançar');
console.log('PASS temGroq/info (chave:', A.temGroq() ? 'presente' : 'ausente', ')');
