import { describe, expect, it } from "vitest";
import {
  montarLinhaBloco,
  parseTags,
  resumoBlocos,
  situacaoPacote,
  validarBloco,
  type ValoresBlocoPacote,
} from "./logica-pacotes";

const base: ValoresBlocoPacote = {
  titulo: "Juros",
  conteudo: "Limite de 1% ao mês.",
  modo: "sempre",
  category: "",
  tags: "",
};

describe("validarBloco", () => {
  it("aceita bloco válido", () => {
    expect(validarBloco(base)).toBeNull();
  });
  it("exige título e conteúdo", () => {
    expect(validarBloco({ ...base, titulo: "  " })).toMatch(/título/);
    expect(validarBloco({ ...base, conteudo: "" })).toMatch(/conteúdo/);
  });
  it("modo sempre limita a 1500 e sugere trocar de modo", () => {
    const grande = "a".repeat(1501);
    expect(validarBloco({ ...base, conteudo: grande })).toMatch(/Por relevância/);
    expect(validarBloco({ ...base, conteudo: grande, modo: "relevancia" })).toBeNull();
    expect(validarBloco({ ...base, conteudo: "a".repeat(8001), modo: "relevancia" })).toMatch(
      /divida/,
    );
  });
});

describe("tags e linha", () => {
  it("normaliza tags", () => {
    expect(parseTags(" Serasa, juros ,, serasa ")).toEqual(["serasa", "juros"]);
  });
  it("categoria vazia vira null", () => {
    expect(montarLinhaBloco({ ...base, titulo: " Juros ", tags: "a,b" })).toEqual({
      titulo: "Juros",
      conteudo: "Limite de 1% ao mês.",
      modo: "sempre",
      category: null,
      tags: ["a", "b"],
    });
  });
});

describe("situacaoPacote", () => {
  it("pacote de Loja não instalado pede instalação", () => {
    expect(
      situacaoPacote(
        { origem: "admin", loja_aplicativo_id: "x" },
        { ligado: true, instalado: false },
      ),
    ).toBe("instalar");
  });
  it("pacote livre ou instalado alterna", () => {
    expect(
      situacaoPacote(
        { origem: "admin", loja_aplicativo_id: null },
        { ligado: false, instalado: false },
      ),
    ).toBe("desligado");
    expect(
      situacaoPacote(
        { origem: "admin", loja_aplicativo_id: "x" },
        { ligado: true, instalado: true },
      ),
    ).toBe("ligado");
    expect(
      situacaoPacote(
        { origem: "tenant", loja_aplicativo_id: null },
        { ligado: true, instalado: false },
      ),
    ).toBe("ligado");
  });
});

describe("resumoBlocos", () => {
  it("conta só os ativos por modo", () => {
    expect(resumoBlocos([])).toBe("Sem blocos ainda");
    expect(
      resumoBlocos([
        { modo: "sempre", ativo: true },
        { modo: "relevancia", ativo: true },
        { modo: "relevancia", ativo: true },
        { modo: "relevancia", ativo: false },
      ]),
    ).toBe("3 blocos ativos · 1 sempre · 2 por relevância");
  });
});
