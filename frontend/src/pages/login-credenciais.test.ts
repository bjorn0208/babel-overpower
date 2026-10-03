// Testes do parser de credenciais do Login Commandbar (Porteiro).
//
// Bug coberto: após 1ª tentativa falhar, a fase vira "senha" em silêncio.
// Se o user redigita "apelido senha" juntos, a frase inteira virava a senha
// e a 2ª tentativa falhava SEMPRE. `resolverSenhaFaseSenha` reconhece o
// reenvio completo e extrai só a senha.
import { describe, expect, it } from "vitest";
import {
  extrairCredenciais,
  resolverSenhaFaseSenha,
} from "./login-credenciais";

describe("extrairCredenciais", () => {
  it("extrai apelido e senha de frase com os dois juntos", () => {
    expect(extrairCredenciais("godtheus Akhenaton")).toEqual({
      apelido: "godtheus",
      senha: "Akhenaton",
    });
  });

  it("ignora conectores e palavras de preenchimento", () => {
    expect(
      extrairCredenciais("meu apelido é godtheus senha Akhenaton"),
    ).toEqual({ apelido: "godtheus", senha: "Akhenaton" });
  });

  it("retorna só apelido quando veio um token", () => {
    expect(extrairCredenciais("godtheus")).toEqual({
      apelido: "godtheus",
      senha: null,
    });
  });

  it("retorna nulos pra entrada vazia", () => {
    expect(extrairCredenciais("   ")).toEqual({ apelido: null, senha: null });
  });
});

describe("resolverSenhaFaseSenha", () => {
  it("senha digitada sozinha passa crua", () => {
    expect(resolverSenhaFaseSenha("Akhenaton", "godtheus")).toBe("Akhenaton");
  });

  it("reenvio 'apelido senha' juntos extrai só a senha (o bug da 2ª tentativa)", () => {
    expect(resolverSenhaFaseSenha("GODTHEUS Akhenaton", "godtheus")).toBe(
      "Akhenaton",
    );
  });

  it("reenvio com conectores tipo 'senha' também extrai", () => {
    expect(
      resolverSenhaFaseSenha("godtheus senha Akhenaton", "godtheus"),
    ).toBe("Akhenaton");
  });

  it("senha colada que começa com o apelido NÃO é tratada como reenvio", () => {
    expect(resolverSenhaFaseSenha("godtheus123", "godtheus")).toBe(
      "godtheus123",
    );
  });

  it("frase com apelido diferente passa crua (não é reenvio do mesmo user)", () => {
    expect(resolverSenhaFaseSenha("outro Akhenaton", "godtheus")).toBe(
      "outro Akhenaton",
    );
  });

  it("senha com espaços sem apelido na frente passa crua", () => {
    expect(resolverSenhaFaseSenha("minha frase secreta", "godtheus")).toBe(
      "minha frase secreta",
    );
  });
});
