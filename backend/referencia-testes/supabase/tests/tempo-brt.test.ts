/**
 * Teste do helper de tempo BRT do agendamento de compromissos.
 * RODAR COM TZ=UTC (reproduz o runtime das edge functions Deno):
 *   TZ=UTC npx tsx tests/tempo-brt.test.ts
 * Sem TZ=UTC a máquina local (BRT) mascararia justamente o bug de fuso.
 */
import assert from "node:assert/strict";
import { calcularExecutarEmBRT } from "../functions/_shared/tempo-brt.ts";

let passou = 0;
function t(nome: string, fn: () => void) {
  try {
    fn();
    passou++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    console.error(`  FALHOU  ${nome}\n    ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

// Âncora: 2026-05-16 08:00:00 BRT === 2026-05-16T11:00:00.000Z
const AGORA = Date.parse("2026-05-16T11:00:00.000Z");

t("amanha com hora 15:00 -> 2026-05-17 15:00 BRT (18:00Z)", () => {
  const r = calcularExecutarEmBRT({ quando_relativo: { tipo: "amanha", hora: "15:00" } }, AGORA);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.iso, "2026-05-17T18:00:00.000Z");
});

t("amanha periodo tarde (sem hora) -> 14:00 BRT (17:00Z)", () => {
  const r = calcularExecutarEmBRT({ quando_relativo: { tipo: "amanha", periodo: "tarde" } }, AGORA);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.iso, "2026-05-17T17:00:00.000Z");
});

t("hoje 15:00 BRT (futuro vs 08:00) -> 18:00Z mesmo dia", () => {
  const r = calcularExecutarEmBRT({ quando_relativo: { tipo: "hoje", hora: "15:00" } }, AGORA);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.iso, "2026-05-16T18:00:00.000Z");
});

t("hoje com hora ja passada -> erro de coerencia (nao grava no passado)", () => {
  const agoraTarde = Date.parse("2026-05-16T20:00:00.000Z"); // 17:00 BRT
  const r = calcularExecutarEmBRT({ quando_relativo: { tipo: "hoje", hora: "15:00" } }, agoraTarde);
  assert.equal(r.ok, false);
});

t("executar_em ISO SEM timezone e tratado como BRT (+3h em UTC)", () => {
  const r = calcularExecutarEmBRT({ executar_em: "2026-05-17T15:00:00" }, AGORA);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.iso, "2026-05-17T18:00:00.000Z");
});

t("executar_em ISO COM timezone -03:00 e respeitado", () => {
  const r = calcularExecutarEmBRT({ executar_em: "2026-05-17T15:00:00-03:00" }, AGORA);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.iso, "2026-05-17T18:00:00.000Z");
});

t("relativo em_horas:2 -> agora + 2h", () => {
  const r = calcularExecutarEmBRT({ quando_relativo: { tipo: "relativo", em_horas: 2 } }, AGORA);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.iso, "2026-05-16T13:00:00.000Z");
});

t("data no passado -> erro de coerencia", () => {
  const r = calcularExecutarEmBRT({ executar_em: "2020-01-01T10:00:00-03:00" }, AGORA);
  assert.equal(r.ok, false);
});

t("dia_semana segunda 10:00 (hoje sab 16/05) -> proxima segunda 18/05 13:00Z", () => {
  const r = calcularExecutarEmBRT({ quando_relativo: { tipo: "dia_semana", dia_semana: "segunda", hora: "10:00" } }, AGORA);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.iso, "2026-05-18T13:00:00.000Z");
});

t("sem executar_em nem quando_relativo -> erro", () => {
  const r = calcularExecutarEmBRT({}, AGORA);
  assert.equal(r.ok, false);
});

console.log(`\n${passou} testes ok`);
