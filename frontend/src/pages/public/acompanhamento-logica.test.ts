import { describe, it, expect } from "vitest";
import {
  normalizarListaFluxosPublico,
  escolherFluxoParaLead,
  calcularTimer,
  calcularProgresso,
  type FluxoProduto,
} from "./acompanhamento-logica";

const fluxo = (produto: string): FluxoProduto => ({
  produto,
  stages: [
    { id: "s1", label: "Etapa 1", color: "#000", checkpoints: [{ id: "c1", label: "A" }, { id: "c2", label: "B" }] },
    { id: "s2", label: "Etapa 2", color: "#000", checkpoints: [{ id: "c3", label: "C" }] },
  ],
});

describe("normalizarListaFluxosPublico", () => {
  it("array passa direto; objeto único com stages vira lista; resto vira []", () => {
    expect(normalizarListaFluxosPublico([fluxo("x")])).toHaveLength(1);
    expect(normalizarListaFluxosPublico(fluxo("x"))).toHaveLength(1);
    expect(normalizarListaFluxosPublico(null)).toEqual([]);
    expect(normalizarListaFluxosPublico({ foo: 1 })).toEqual([]);
  });
});

describe("escolherFluxoParaLead", () => {
  it("casa por produto (igual/contém); sem match cai no primeiro; lista vazia = null", () => {
    const flows = [fluxo("Limpa Nome"), fluxo("Consultoria")];
    expect(escolherFluxoParaLead(flows, "limpa nome")?.produto).toBe("Limpa Nome");
    expect(escolherFluxoParaLead(flows, "limpa")?.produto).toBe("Limpa Nome");
    expect(escolherFluxoParaLead(flows, "inexistente")?.produto).toBe("Limpa Nome");
    expect(escolherFluxoParaLead(flows, null)?.produto).toBe("Limpa Nome");
    expect(escolherFluxoParaLead([], "x")).toBeNull();
  });
});

describe("calcularTimer", () => {
  it("verde no prazo, amarelo atenção, vermelho atrasado; null se sem data", () => {
    const hoje = new Date().toISOString();
    const v = calcularTimer(hoje, 7, 30);
    expect(v.days).toBe(0);
    expect(v.isLate).toBe(false);
    expect(v.timerLabel).toBe("No prazo");
    const d10 = new Date(Date.now() - 10 * 86400000).toISOString();
    expect(calcularTimer(d10, 7, 30).timerLabel).toBe("Atenção");
    const d40 = new Date(Date.now() - 40 * 86400000).toISOString();
    const late = calcularTimer(d40, 7, 30);
    expect(late.isLate).toBe(true);
    expect(late.timerLabel).toBe("Atrasado");
    expect(calcularTimer(null, 7, 30).days).toBeNull();
  });
});

describe("calcularProgresso", () => {
  it("conta checkpoints concluídos / total → %", () => {
    const f = fluxo("x");
    expect(calcularProgresso(f, {})).toEqual({ totalCps: 3, doneCps: 0, progressPct: 0 });
    expect(calcularProgresso(f, { c1: true, c2: true, c3: true })).toEqual({ totalCps: 3, doneCps: 3, progressPct: 100 });
    expect(calcularProgresso(f, { c1: true })).toEqual({ totalCps: 3, doneCps: 1, progressPct: 33 });
    expect(calcularProgresso(null, { c1: true })).toEqual({ totalCps: 0, doneCps: 0, progressPct: 0 });
  });
});
