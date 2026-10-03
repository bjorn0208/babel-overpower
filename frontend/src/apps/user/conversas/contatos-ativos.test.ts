import { describe, it, expect } from "vitest";
import { ehContatoAtivo, LOCATION_BASE } from "./contatos-ativos";

describe("ehContatoAtivo", () => {
  it("atendimento e cliente são ativos (ficam no Conversas)", () => {
    expect(ehContatoAtivo("atendimento")).toBe(true);
    expect(ehContatoAtivo("cliente")).toBe(true);
  });

  it("base sai do Conversas (foi pra Base)", () => {
    expect(ehContatoAtivo(LOCATION_BASE)).toBe(false);
    expect(ehContatoAtivo("base")).toBe(false);
  });

  it("null/indefinido/desconhecido = ativo (conservador: não some contato)", () => {
    expect(ehContatoAtivo(null)).toBe(true);
    expect(ehContatoAtivo(undefined)).toBe(true);
    expect(ehContatoAtivo("")).toBe(true);
    expect(ehContatoAtivo("qualquer_coisa")).toBe(true);
  });
});
