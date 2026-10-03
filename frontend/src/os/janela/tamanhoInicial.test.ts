import { describe, it, expect } from "vitest";
import {
  calcularTamanhoInicial,
  MARGEM_TOPO_JANELA,
  MARGEM_BORDA_JANELA,
} from "./tamanhoInicial";

describe("calcularTamanhoInicial", () => {
  it("tela grande: abre no tamanho natural (escala 1)", () => {
    const r = calcularTamanhoInicial({ baseW: 1280, baseH: 800, vw: 2560, vh: 1440 });
    expect(r.w).toBe(1280);
    expect(r.h).toBe(800);
    expect(r.zoom).toBe(1);
  });

  it("app maior que a tela: encolhe pra caber, aspecto preservado", () => {
    const baseW = 1280;
    const baseH = 800;
    const vw = 1280;
    const vh = 745;
    const r = calcularTamanhoInicial({ baseW, baseH, vw, vh });

    // Cabe na viewport útil (com as margens reservadas).
    expect(r.w).toBeLessThanOrEqual(vw - MARGEM_BORDA_JANELA * 2);
    expect(r.h).toBeLessThanOrEqual(vh - MARGEM_TOPO_JANELA - MARGEM_BORDA_JANELA);
    expect(r.zoom).toBeLessThan(1);

    // Aspecto base mantido: w/h ~ baseW/baseH.
    expect(r.w / r.h).toBeCloseTo(baseW / baseH, 1);
  });

  it("o eixo mais apertado manda (altura limita)", () => {
    // Largura folgada, altura curta: a escala vem da altura.
    const r = calcularTamanhoInicial({ baseW: 800, baseH: 800, vw: 4000, vh: 500 });
    const escalaAltura = (500 - MARGEM_TOPO_JANELA - MARGEM_BORDA_JANELA) / 800;
    expect(r.zoom).toBeCloseTo(escalaAltura, 5);
  });

  it("respeita margens customizadas", () => {
    const r = calcularTamanhoInicial({
      baseW: 1000,
      baseH: 1000,
      vw: 1000,
      vh: 1000,
      margemTopo: 0,
      margemBorda: 0,
    });
    expect(r.zoom).toBe(1);
    expect(r.w).toBe(1000);
  });

  it("viewport minúscula não quebra (sem divisão por zero / valores negativos)", () => {
    const r = calcularTamanhoInicial({ baseW: 1280, baseH: 800, vw: 10, vh: 10 });
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
    expect(r.zoom).toBeGreaterThan(0);
  });
});
