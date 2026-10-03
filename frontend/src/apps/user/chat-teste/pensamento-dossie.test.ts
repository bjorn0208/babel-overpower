import { describe, expect, it } from "vitest";
import type { AcaoPretendida, Pensamento } from "../conversas/tipos";
import { pensamentoDoDossie } from "./pensamento-dossie";

const ACOES = new Set<AcaoPretendida>([
  "responder_e_aguardar",
  "fazer_pergunta_de_qualificacao",
  "oferecer",
  "fechar",
  "agendar_retorno",
  "escalar_humano",
  "esperar_silencio",
  "registrar_e_seguir",
]);
const ehAcaoValida = (s: unknown): s is AcaoPretendida =>
  typeof s === "string" && ACOES.has(s as AcaoPretendida);

const fallback: Pensamento = {
  id: "pens-fallback",
  proxima_intencao: "fallback do trace",
  acao_pretendida: "responder_e_aguardar",
  leitura_da_situacao: null,
  motivo: null,
  quando_voltar: null,
  plano_proximos_turnos: [],
  criado_em: "2026-05-16T00:00:00.000Z",
};

describe("pensamentoDoDossie", () => {
  it("retorna o fallback quando pensamento_atual e null", () => {
    expect(pensamentoDoDossie(null, fallback, ehAcaoValida)).toBe(fallback);
  });

  it("retorna o fallback quando pensamento_atual nao tem conteudo util", () => {
    expect(pensamentoDoDossie({ score_lead: 90 }, fallback, ehAcaoValida)).toBe(fallback);
  });

  it("monta o pensamento rico a partir do pensamento_atual do RPC", () => {
    const pa = {
      proxima_intencao: "Obter o aceite para o envio do contrato.",
      acao_pretendida: "responder_e_aguardar",
      leitura_da_situacao: "O lead aceitou a explicacao e agora estou na fase de negociacao.",
      motivo: "O lead concordou em ouvir sobre a contratacao.",
      quando_voltar: null,
      plano_proximos_turnos: [
        { turno: 1, o_que_fazer: "Se o lead aceitar, chamar a tool de contrato.", por_que: "Seguir o fluxo cravado." },
      ],
    };
    const p = pensamentoDoDossie(pa, fallback, ehAcaoValida);
    expect(p.proxima_intencao).toBe("Obter o aceite para o envio do contrato.");
    expect(p.motivo).toBe("O lead concordou em ouvir sobre a contratacao.");
    expect(p.leitura_da_situacao).toBe(
      "O lead aceitou a explicacao e agora estou na fase de negociacao.",
    );
    expect(p.plano_proximos_turnos).toEqual([
      { turno: 1, o_que_fazer: "Se o lead aceitar, chamar a tool de contrato.", por_que: "Seguir o fluxo cravado." },
    ]);
    expect(p).not.toBe(fallback);
  });

  it("cai pra responder_e_aguardar quando a acao_pretendida do RPC e invalida", () => {
    const p = pensamentoDoDossie(
      { proxima_intencao: "x", acao_pretendida: "rituximabe" },
      fallback,
      ehAcaoValida,
    );
    expect(p.acao_pretendida).toBe("responder_e_aguardar");
  });
});
