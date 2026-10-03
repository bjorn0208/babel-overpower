// Saliência da memória do dono reusa a do lead — datas fixas, sem rede.
// TZ=UTC npx tsx supabase/tests/memoria-dono.test.ts
import { strict as assert } from "node:assert";
import { curarFatosPorSaliencia } from "../functions/_shared/recall-memoria.ts";

const agora = Date.now();
const diasAtras = (d: number) => new Date(agora - d * 86_400_000).toISOString();

// a) fato antigo mas muito evocado e de alta relevância vence fato recente nunca evocado com o mesmo score
const curados = curarFatosPorSaliencia([
  { id: "antigo-forte", fato: "meta é 100 contratos/mês", score: 0.8, relevancia: "alta", vezes_evocado: 9, ultima_evocacao_em: diasAtras(30) },
  { id: "recente-fraco", fato: "pediu print da tela ontem", score: 0.8, relevancia: "baixa", vezes_evocado: 0, criado_em: diasAtras(1) },
]);
assert.equal(curados[0].id, "antigo-forte");

// b) budget de 12 por item é respeitado
const muitos = Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, fato: `f${i}`, score: 0.5, relevancia: "media", vezes_evocado: 0, criado_em: diasAtras(i) }));
assert.equal(curarFatosPorSaliencia(muitos).length, 12);

// c) vazio → vazio
assert.deepEqual(curarFatosPorSaliencia([]), []);

console.log("memoria-dono.test.ts OK — 3 casos passaram.");
