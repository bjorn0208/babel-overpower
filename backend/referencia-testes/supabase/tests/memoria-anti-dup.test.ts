// Teste da função de decisão pura do gate anti-duplicação semântico.
// Rodar: TZ=UTC npx tsx tests/memoria-anti-dup.test.ts
// Cobre a regra que mata a duplicata de percepção (NOOP em similar acima do threshold).

import assert from "node:assert/strict";
import { decidirAcaoFato } from "../functions/_shared/memoria-anti-dup.ts";

let passou = 0;
function caso(nome: string, fn: () => void) {
  fn();
  passou++;
  console.log(`  ok — ${nome}`);
}

console.log("decidirAcaoFato:");

caso("sem similar → ADD", () => {
  const r = decidirAcaoFato({ fatoTexto: "quer financiar um carro", confianca: 0.9, threshold: 0.8, hitTopo: null });
  assert.equal(r.decisao, "ADD");
});

caso("confiança < 0.5 → NOOP (descarta especulação)", () => {
  const r = decidirAcaoFato({ fatoTexto: "talvez tenha interesse", confianca: 0.4, threshold: 0.8, hitTopo: { id: "x", fato: "qualquer", similaridade: 0.1 } });
  assert.equal(r.decisao, "NOOP");
});

caso("similar acima do threshold, não mais específico → NOOP (mata duplicata)", () => {
  const r = decidirAcaoFato({
    fatoTexto: "pretende comprar um veículo",
    confianca: 0.9,
    threshold: 0.8,
    hitTopo: { id: "abc", fato: "quer financiar um carro", similaridade: 0.86 },
  });
  assert.equal(r.decisao, "NOOP");
});

caso("similar acima do threshold + mais específico + confiança alta → UPDATE", () => {
  const r = decidirAcaoFato({
    fatoTexto: "quer financiar um carro zero km na concessionária ainda este mês para usar no trabalho",
    confianca: 0.9,
    threshold: 0.8,
    hitTopo: { id: "abc", fato: "quer um carro", similaridade: 0.85 },
  });
  assert.equal(r.decisao, "UPDATE");
  assert.equal(r.fatoExistenteId, "abc");
});

caso("similar abaixo do threshold → ADD", () => {
  const r = decidirAcaoFato({
    fatoTexto: "tem dívida no Serasa",
    confianca: 0.9,
    threshold: 0.8,
    hitTopo: { id: "abc", fato: "quer um carro", similaridade: 0.4 },
  });
  assert.equal(r.decisao, "ADD");
});

console.log(`\n${passou} casos OK`);
