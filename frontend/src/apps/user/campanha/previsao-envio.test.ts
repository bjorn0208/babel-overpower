import { describe, expect, it } from "vitest";

import {
  dentroDeJanela,
  motivoSemPrevisao,
  preverEnvios,
  rotuloQuando,
  type JanelaCampanha,
} from "./previsao-envio";

const BRT = 3 * 60 * 60 * 1000;
/** Data/hora em BRT → instante real (UTC). */
const brt = (iso: string) => new Date(new Date(`${iso}Z`).getTime() + BRT);

const base: JanelaCampanha = {
  status: "ativa",
  starts_at: brt("2026-09-01T09:00").toISOString(),
  ends_at: null,
  window_start: "09:00",
  window_end: "18:00",
  weekdays: [1, 2, 3, 4, 5], // seg–sex
  throttle_per_day: null,
  throttle_per_hour: null,
};

describe("dentroDeJanela", () => {
  it("dia útil dentro do horário", () => {
    // 2026-09-17 é quinta-feira
    expect(dentroDeJanela(base, brt("2026-09-17T10:00"))).toBe(true);
  });
  it("fora do horário", () => {
    expect(dentroDeJanela(base, brt("2026-09-17T08:59"))).toBe(false);
    expect(dentroDeJanela(base, brt("2026-09-17T18:00"))).toBe(false);
  });
  it("fim de semana fora dos weekdays", () => {
    expect(dentroDeJanela(base, brt("2026-09-19T10:00"))).toBe(false); // sábado
  });
  it("janela que vira a meia-noite", () => {
    const noturna = { ...base, window_start: "22:00", window_end: "02:00" };
    expect(dentroDeJanela(noturna, brt("2026-09-17T23:30"))).toBe(true);
    expect(dentroDeJanela(noturna, brt("2026-09-18T01:00"))).toBe(true); // madrugada da quinta
    expect(dentroDeJanela(noturna, brt("2026-09-17T21:00"))).toBe(false);
  });
});

describe("motivoSemPrevisao", () => {
  const agora = brt("2026-09-17T10:00");
  it("pausa do tenant vence tudo", () => {
    expect(motivoSemPrevisao(base, agora, true)).toBe("disparos_pausados");
  });
  it("campanha em rascunho não dispara", () => {
    expect(motivoSemPrevisao({ ...base, status: "rascunho" }, agora)).toBe("campanha_rascunho");
  });
  it("campanha pausada", () => {
    expect(motivoSemPrevisao({ ...base, status: "pausada" }, agora)).toBe("campanha_pausada");
  });
  it("ends_at vencido", () => {
    expect(motivoSemPrevisao({ ...base, ends_at: brt("2026-09-10T10:00").toISOString() }, agora))
      .toBe("campanha_finalizada");
  });
  it("sem dia da semana = janela impossível", () => {
    expect(motivoSemPrevisao({ ...base, weekdays: [] }, agora)).toBe("janela_impossivel");
  });
  it("campanha ativa e dentro do prazo tem previsão", () => {
    expect(motivoSemPrevisao(base, agora)).toBe(null);
  });
});

describe("preverEnvios", () => {
  const agora = brt("2026-09-17T10:00"); // quinta, 10h, dentro da janela

  it("sem teto, todos saem no próximo minuto aberto", () => {
    const p = preverEnvios(base, ["a", "b", "c"], { hoje: 0, ultimaHora: 0 }, agora);
    // janela já aberta às 10:00 em ponto = "assim que o motor passar", não +1min
    expect(p.map((x) => x.quando && rotuloQuando(x.quando, agora))).toEqual([
      "hoje 10:00", "hoje 10:00", "hoje 10:00",
    ]);
  });

  it("teto por hora empurra o excedente para a hora seguinte", () => {
    const c = { ...base, throttle_per_hour: 2 };
    const p = preverEnvios(c, ["a", "b", "c", "d"], { hoje: 0, ultimaHora: 0 }, agora);
    const r = p.map((x) => rotuloQuando(x.quando!, agora));
    expect(r[0]).toBe("hoje 10:00");
    expect(r[1]).toBe("hoje 10:00");
    expect(r[2]).toBe("hoje 11:00");
    expect(r[3]).toBe("hoje 11:00");
  });

  it("o que já saiu na hora conta no teto", () => {
    const c = { ...base, throttle_per_hour: 2 };
    const p = preverEnvios(c, ["a"], { hoje: 5, ultimaHora: 2 }, agora);
    expect(rotuloQuando(p[0].quando!, agora)).toBe("hoje 11:00");
  });

  it("teto diário joga o resto para o próximo dia útil dentro da janela", () => {
    const c = { ...base, throttle_per_day: 2 };
    const p = preverEnvios(c, ["a", "b", "c"], { hoje: 0, ultimaHora: 0 }, agora);
    expect(rotuloQuando(p[0].quando!, agora)).toBe("hoje 10:00");
    expect(rotuloQuando(p[1].quando!, agora)).toBe("hoje 10:00");
    expect(rotuloQuando(p[2].quando!, agora)).toBe("amanhã 09:00");
  });

  it("teto diário já estourado hoje: primeiro da fila vai pra amanhã", () => {
    const c = { ...base, throttle_per_day: 3 };
    const p = preverEnvios(c, ["a"], { hoje: 3, ultimaHora: 0 }, agora);
    expect(rotuloQuando(p[0].quando!, agora)).toBe("amanhã 09:00");
  });

  it("fora da janela, espera a próxima abertura", () => {
    const sabado = brt("2026-09-19T12:00");
    const p = preverEnvios(base, ["a"], { hoje: 0, ultimaHora: 0 }, sabado);
    expect(rotuloQuando(p[0].quando!, sabado)).toBe("seg 21/09 09:00");
  });

  it("início no futuro: espera a data de início", () => {
    const c = { ...base, starts_at: brt("2026-09-21T09:00").toISOString() };
    const p = preverEnvios(c, ["a"], { hoje: 0, ultimaHora: 0 }, agora);
    expect(rotuloQuando(p[0].quando!, agora)).toBe("seg 21/09 09:00");
  });

  it("pausado: ninguém tem horário, e o motivo vem junto", () => {
    const p = preverEnvios(base, ["a", "b"], { hoje: 0, ultimaHora: 0 }, agora, true);
    expect(p.every((x) => x.quando === null && x.motivo === "disparos_pausados")).toBe(true);
  });

  it("fila vazia não quebra", () => {
    expect(preverEnvios(base, [], { hoje: 0, ultimaHora: 0 }, agora)).toEqual([]);
  });
});
