import { strict as assert } from "node:assert";
import {
  canalElegivel,
  derivarCanalConversa,
} from "../functions/_shared/canal-conversa.ts";

// ── derivarCanalConversa: Fase 2 → SEMPRE "externo" exceto sinal interno confiável ──
assert.equal(derivarCanalConversa(undefined), "externo");
assert.equal(derivarCanalConversa(null), "externo");
assert.equal(derivarCanalConversa({}), "externo");
assert.equal(derivarCanalConversa({ modoTeste: true }), "externo"); // dono simula cliente = externo
assert.equal(derivarCanalConversa({ channelConversa: "whatsapp" }), "externo");
assert.equal(derivarCanalConversa({ channelConversa: "teste" }), "externo");
// tentativa de forjar via campo solto (não existe esse caminho — só origemInternaConfiavel conta)
assert.equal(derivarCanalConversa({ origemInternaConfiavel: false }), "externo");
// sinal interno confiável (só Fase 3 produz) → interno
assert.equal(derivarCanalConversa({ origemInternaConfiavel: true }), "interno");

// ── canalElegivel: conversa externa ──
assert.equal(canalElegivel("externo", "externo"), true);
assert.equal(canalElegivel("ambos", "externo"), true);
assert.equal(canalElegivel("interno", "externo"), false); // segurança T3-edge
assert.equal(canalElegivel("", "externo"), true); // default/desconhecido elegível (= filtro fixo)
assert.equal(canalElegivel("xpto", "externo"), true);

// ── canalElegivel: conversa interna ──
assert.equal(canalElegivel("interno", "interno"), true);
assert.equal(canalElegivel("ambos", "interno"), true);
assert.equal(canalElegivel("externo", "interno"), false);
assert.equal(canalElegivel("xpto", "interno"), true);

// ── PROVA DE EQUIVALÊNCIA com o filtro fixo do T3-edge (Fase 2 = sem regressão) ──
// Enquanto não há fonte interna, derivarCanalConversa(qualquer origem Fase 2) = "externo".
// Logo canalElegivel(x, canal) deve dar EXATAMENTE o mesmo que o antigo `x !== "interno"`.
const origensFase2 = [
  undefined,
  {},
  { modoTeste: true },
  { channelConversa: "whatsapp" },
  { channelConversa: "teste" },
  { origemInternaConfiavel: false },
];
const valoresCargo = ["externo", "interno", "ambos", "", "qualquer"];
for (const o of origensFase2) {
  const canal = derivarCanalConversa(o);
  assert.equal(canal, "externo", "Fase 2: toda origem resolve externo");
  for (const v of valoresCargo) {
    assert.equal(
      canalElegivel(v, canal),
      v !== "interno",
      `equivalência T3-edge quebrada p/ cargo="${v}"`,
    );
  }
}

console.log("canal-conversa.test.ts OK");
