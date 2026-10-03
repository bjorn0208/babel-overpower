import { describe, expect, it } from "vitest";
import { gerarPhoneSessaoTeste } from "./sessao-teste";

describe("gerarPhoneSessaoTeste", () => {
  it("monta o phone no formato __chat_teste_<uid8>_<ts>__", () => {
    const phone = gerarPhoneSessaoTeste("1ec3f624-6555-482f-9b38-59579efd8016", 1778900000000);
    expect(phone).toBe("__chat_teste_1ec3f624_1778900000000__");
  });

  it("gera phones diferentes pra sessoes com timestamp diferente (lead novo por sessao)", () => {
    const uid = "1ec3f624-6555-482f-9b38-59579efd8016";
    const a = gerarPhoneSessaoTeste(uid, 1778900000000);
    const b = gerarPhoneSessaoTeste(uid, 1778900000001);
    expect(a).not.toBe(b);
  });

  it("e deterministico pro mesmo uid e timestamp (reabrir a mesma sessao)", () => {
    const uid = "1ec3f624-6555-482f-9b38-59579efd8016";
    expect(gerarPhoneSessaoTeste(uid, 42)).toBe(gerarPhoneSessaoTeste(uid, 42));
  });
});
