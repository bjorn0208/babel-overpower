import { describe, it, expect } from "vitest";
import { ehTextoSelecionavel } from "./selecaoTexto";

describe("ehTextoSelecionavel", () => {
  it("nó de texto com conteúdo e user-select livre = selecionável", () => {
    expect(
      ehTextoSelecionavel({
        ehTextNode: true,
        texto: "Olá mundo",
        userSelect: "auto",
      }),
    ).toBe(true);
  });

  it("user-select vazio (default) também conta como selecionável", () => {
    expect(
      ehTextoSelecionavel({ ehTextNode: true, texto: "abc", userSelect: "" }),
    ).toBe(true);
  });

  it("só espaço/quebra de linha = NÃO selecionável (arrasta janela)", () => {
    expect(
      ehTextoSelecionavel({
        ehTextNode: true,
        texto: "   \n\t ",
        userSelect: "auto",
      }),
    ).toBe(false);
  });

  it("não é nó de texto = NÃO selecionável", () => {
    expect(
      ehTextoSelecionavel({
        ehTextNode: false,
        texto: "tem texto",
        userSelect: "auto",
      }),
    ).toBe(false);
  });

  it("user-select none = NÃO selecionável (chrome do sistema)", () => {
    expect(
      ehTextoSelecionavel({
        ehTextNode: true,
        texto: "Título",
        userSelect: "none",
      }),
    ).toBe(false);
  });
});
