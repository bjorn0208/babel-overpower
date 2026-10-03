import { describe, it, expect } from "vitest";
import {
  ehCanto,
  calcularResizeCanto,
  ZOOM_MIN,
  ZOOM_MAX,
} from "./zoomCanto";

describe("ehCanto", () => {
  it("canto = 2 letras (ne/nw/se/sw)", () => {
    expect(ehCanto("se")).toBe(true);
    expect(ehCanto("nw")).toBe(true);
    expect(ehCanto("ne")).toBe(true);
    expect(ehCanto("sw")).toBe(true);
  });

  it("borda = 1 letra, vazio = nada", () => {
    expect(ehCanto("n")).toBe(false);
    expect(ehCanto("s")).toBe(false);
    expect(ehCanto("e")).toBe(false);
    expect(ehCanto("w")).toBe(false);
    expect(ehCanto("")).toBe(false);
  });
});

describe("calcularResizeCanto", () => {
  it("limites de zoom expostos = 40%–250%", () => {
    expect(ZOOM_MIN).toBe(0.4);
    expect(ZOOM_MAX).toBe(2.5);
  });

  it("canto SE crescendo: aspecto travado, top-left ancorado", () => {
    const r = calcularResizeCanto({
      dir: "se",
      dx: 200,
      dy: 100,
      origX: 100,
      origY: 50,
      origW: 1000,
      origH: 500,
      baseW: 1000,
      baseH: 500,
    });
    expect(r.zoom).toBeCloseTo(1.2, 6);
    expect(r.w).toBeCloseTo(1200, 6);
    expect(r.h).toBeCloseTo(600, 6);
    expect(r.x).toBe(100);
    expect(r.y).toBe(50);
  });

  it("canto NW crescendo (drag pra cima-esquerda): bottom-right ancorado", () => {
    const r = calcularResizeCanto({
      dir: "nw",
      dx: -200,
      dy: -100,
      origX: 100,
      origY: 50,
      origW: 1000,
      origH: 500,
      baseW: 1000,
      baseH: 500,
    });
    expect(r.zoom).toBeCloseTo(1.2, 6);
    expect(r.w).toBeCloseTo(1200, 6);
    expect(r.h).toBeCloseTo(600, 6);
    // bottom-right fixo em (1100, 550); top-left recua
    expect(r.x).toBeCloseTo(-100, 6);
    expect(r.y).toBeCloseTo(-50, 6);
  });

  it("clampa no mínimo (não some / canto continua pegável)", () => {
    const r = calcularResizeCanto({
      dir: "se",
      dx: -900,
      dy: -450,
      origX: 100,
      origY: 50,
      origW: 1000,
      origH: 500,
      baseW: 1000,
      baseH: 500,
    });
    expect(r.zoom).toBe(ZOOM_MIN);
    expect(r.w).toBeCloseTo(400, 6);
    expect(r.h).toBeCloseTo(200, 6);
    expect(r.x).toBe(100);
    expect(r.y).toBe(50);
  });

  it("clampa no máximo", () => {
    const r = calcularResizeCanto({
      dir: "se",
      dx: 2000,
      dy: 1000,
      origX: 100,
      origY: 50,
      origW: 1000,
      origH: 500,
      baseW: 1000,
      baseH: 500,
    });
    expect(r.zoom).toBe(ZOOM_MAX);
    expect(r.w).toBeCloseTo(2500, 6);
    expect(r.h).toBeCloseTo(1250, 6);
  });

  it("aspecto sempre travado em baseW/baseH e zoom = w/baseW (canto NE assimétrico)", () => {
    const r = calcularResizeCanto({
      dir: "ne",
      dx: 300,
      dy: -150,
      origX: 0,
      origY: 0,
      origW: 1200,
      origH: 800,
      baseW: 1200,
      baseH: 800,
    });
    // razão preservada = 1200/800 = 1.5
    expect(r.w / r.h).toBeCloseTo(1200 / 800, 6);
    expect(r.zoom).toBeCloseTo(r.w / 1200, 6);
    expect(r.zoom).toBeCloseTo(1.21875, 6);
    expect(r.w).toBeCloseTo(1462.5, 6);
    expect(r.h).toBeCloseTo(975, 6);
    // NE: left fixo (x=0), bottom fixo (top recua)
    expect(r.x).toBe(0);
    expect(r.y).toBeCloseTo(-175, 6);
  });
});
