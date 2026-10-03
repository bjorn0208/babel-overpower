import { describe, it, expect } from "vitest";
import {
  detectarBordaJanela,
  MARGEM_RESIZE_INTERNA,
  MARGEM_RESIZE_CANTO,
} from "./detectarBorda";

// Janela de referência: 100..1100 x 100..700 (1000 × 600).
const J = { left: 100, right: 1100, top: 100, bottom: 700 };

describe("detectarBorda — zona maior (v2)", () => {
  it("faixa interna de borda = 22 e faixa de canto = 40", () => {
    expect(MARGEM_RESIZE_INTERNA).toBe(22);
    expect(MARGEM_RESIZE_CANTO).toBe(40);
  });

  it("centro da janela = nada", () => {
    expect(detectarBordaJanela(600, 400, J)).toBe("");
  });

  it("borda direita dentro de 22px (longe de canto) = 'e'", () => {
    expect(detectarBordaJanela(1085, 400, J)).toBe("e");
  });

  it("borda esquerda dentro de 22px = 'w'", () => {
    expect(detectarBordaJanela(120, 400, J)).toBe("w");
  });

  it("borda topo dentro de 22px = 'n'", () => {
    expect(detectarBordaJanela(600, 118, J)).toBe("n");
  });

  it("30px da borda (mid, sem eixo vertical) já NÃO pega = nada", () => {
    expect(detectarBordaJanela(1070, 400, J)).toBe("");
  });

  it("canto SE pega numa zona grande — 18px de cada = 'se'", () => {
    expect(detectarBordaJanela(1082, 682, J)).toBe("se");
  });

  it("canto SE pega até ~35px de cada (zona de 40) = 'se'", () => {
    expect(detectarBordaJanela(1065, 665, J)).toBe("se");
  });

  it("fora da janela no canto inferior-direito = 'se'", () => {
    expect(detectarBordaJanela(1115, 715, J)).toBe("se");
  });

  it("canto NW dentro (30px de cada) = 'nw'", () => {
    expect(detectarBordaJanela(130, 130, J)).toBe("nw");
  });
});
