/**
 * Testes TDD para lógica não-trivial do painel direito (2c).
 *
 * Cobre:
 *   1. slugify — derivação automática de slug a partir do rótulo
 *   2. calcularCarrinho — cálculo de totais e agregação de parcelas
 *   3. ordenarJornada — passos ativos vs inativos
 *   4. passoNumero — numeração sequencial só dos ativos
 */

import { describe, it, expect } from "vitest";
import { slugify, calcularCarrinho, stepAtivo, passoNumero } from "./logica";
import type { TemplateV2 } from "../tipos";

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

function templateBase(): TemplateV2 {
  return {
    id: "t1",
    user_id: "u1",
    nome: "Template teste",
    ativo: true,
    conteudo_comum: null,
    clausulas_por_produto: {},
    campos_cliente: [],
    produtos_aceitos: [],
    pagamento: { modo: "unico", chave_pix: null, link_parcelamento: null, posicao_pagamento: null },
    provas: { selfie: false, documento: false, assinatura_manuscrita: false, testemunha: false, num_testemunhas: 0, instrucao_selfie: "" },
    jornada_ordem: ["dados", "pagamento", "contrato", "comprovante", "selfie", "documento", "assinatura", "testemunha"],
  };
}

// ---------------------------------------------------------------------------
// 1. slugify
// ---------------------------------------------------------------------------

describe("slugify", () => {
  it("remove acentos e converte pra minúsculas", () => {
    expect(slugify("Nome Completo")).toBe("nome_completo");
  });

  it("substitui espaços por underscore", () => {
    expect(slugify("data de nascimento")).toBe("data_de_nascimento");
  });

  it("remove caracteres especiais", () => {
    expect(slugify("CPF/CNPJ")).toBe("cpf_cnpj");
  });

  it("remove underscores no início e fim", () => {
    expect(slugify(" campo ")).toBe("campo");
  });

  it("lida com string vazia", () => {
    expect(slugify("")).toBe("");
  });

  it("lida com string só especial", () => {
    expect(slugify("!!!")).toBe("");
  });

  it("preserva números", () => {
    expect(slugify("Telefone2")).toBe("telefone2");
  });

  it("colapsa múltiplos underscores", () => {
    expect(slugify("nome   completo")).toBe("nome_completo");
  });
});

// ---------------------------------------------------------------------------
// 2. calcularCarrinho
// ---------------------------------------------------------------------------

const PRODUTOS_MOCK = [
  { id: "pA", nome: "Produto A" },
  { id: "pB", nome: "Produto B" },
];

describe("calcularCarrinho", () => {
  it("retorna zeros com carrinho vazio", () => {
    const t = templateBase();
    const r = calcularCarrinho(t, [], PRODUTOS_MOCK);
    expect(r.totalAvista).toBe(0);
    expect(r.totalParcelado).toBe(0);
    expect(r.itens).toHaveLength(0);
  });

  it("calcula subtotal à vista corretamente", () => {
    const t = templateBase();
    t.produtos_aceitos = [
      { produto_id: "pA", preco_avista: 100, parcelamento: { entrada: 0, max_parcelas: 1, valor_parcelado_total: 100 } },
    ];
    const r = calcularCarrinho(t, [{ produto_id: "pA", quantidade: 3 }], PRODUTOS_MOCK);
    expect(r.totalAvista).toBe(300);
    expect(r.itens[0].subtotal_avista).toBe(300);
  });

  it("calcula subtotal parcelado corretamente (com juros)", () => {
    const t = templateBase();
    t.produtos_aceitos = [
      { produto_id: "pA", preco_avista: 100, parcelamento: { entrada: 0, max_parcelas: 12, valor_parcelado_total: 120 } },
    ];
    const r = calcularCarrinho(t, [{ produto_id: "pA", quantidade: 2 }], PRODUTOS_MOCK);
    expect(r.totalParcelado).toBe(240);
  });

  it("desconta a entrada antes de dividir as parcelas (contrato do Diego)", () => {
    // Caso real, tenant 1ec3f624, produto "Limpa Nome": TAP de 117 + 5x de 147 = 852.
    // O preview dividia 852 por 5 e anunciava "5x de 170,40" — parcelamento que não
    // existe. A conta certa é a mesma da RPC: (total - entrada) / parcelas.
    const t = templateBase();
    t.produtos_aceitos = [
      { produto_id: "pA", preco_avista: 597, parcelamento: { entrada: 117, max_parcelas: 5, valor_parcelado_total: 852 } },
    ];
    const r = calcularCarrinho(t, [{ produto_id: "pA", quantidade: 1 }], PRODUTOS_MOCK);
    expect(r.totalParcelado).toBe(852);
    expect(r.entrada).toBe(117);
    expect(r.maxParcelas).toBe(5);
    expect(r.valorParcela).toBe(147);
    // a conta fecha de volta no total
    expect(r.entrada + r.valorParcela * r.maxParcelas).toBe(r.totalParcelado);
  });

  it("sem entrada, a parcela é o total dividido pelo nº de parcelas", () => {
    const t = templateBase();
    t.produtos_aceitos = [
      { produto_id: "pA", preco_avista: 100, parcelamento: { entrada: 0, max_parcelas: 4, valor_parcelado_total: 120 } },
    ];
    const r = calcularCarrinho(t, [{ produto_id: "pA", quantidade: 1 }], PRODUTOS_MOCK);
    expect(r.entrada).toBe(0);
    expect(r.valorParcela).toBe(30);
  });

  it("entrada acompanha a quantidade do item", () => {
    const t = templateBase();
    t.produtos_aceitos = [
      { produto_id: "pA", preco_avista: 597, parcelamento: { entrada: 117, max_parcelas: 5, valor_parcelado_total: 852 } },
    ];
    const r = calcularCarrinho(t, [{ produto_id: "pA", quantidade: 2 }], PRODUTOS_MOCK);
    expect(r.totalParcelado).toBe(1704);
    expect(r.entrada).toBe(234);
    expect(r.valorParcela).toBe(294);
  });

  it("agrega min de parcelas entre os produtos (limitante)", () => {
    const t = templateBase();
    t.produtos_aceitos = [
      { produto_id: "pA", preco_avista: 100, parcelamento: { entrada: 0, max_parcelas: 12, valor_parcelado_total: 120 } },
      { produto_id: "pB", preco_avista: 50, parcelamento: { entrada: 0, max_parcelas: 3, valor_parcelado_total: 60 } },
    ];
    const r = calcularCarrinho(
      t,
      [{ produto_id: "pA", quantidade: 1 }, { produto_id: "pB", quantidade: 1 }],
      PRODUTOS_MOCK
    );
    expect(r.maxParcelas).toBe(3); // limitante = min
  });

  it("ignora produto do carrinho não aceito no template", () => {
    const t = templateBase();
    const r = calcularCarrinho(t, [{ produto_id: "pA", quantidade: 1 }], PRODUTOS_MOCK);
    expect(r.itens).toHaveLength(0);
    expect(r.totalAvista).toBe(0);
  });

  it("multi-produto soma totais corretamente", () => {
    const t = templateBase();
    t.produtos_aceitos = [
      { produto_id: "pA", preco_avista: 200, parcelamento: { entrada: 0, max_parcelas: 12, valor_parcelado_total: 240 } },
      { produto_id: "pB", preco_avista: 50, parcelamento: { entrada: 0, max_parcelas: 6, valor_parcelado_total: 60 } },
    ];
    const r = calcularCarrinho(
      t,
      [{ produto_id: "pA", quantidade: 2 }, { produto_id: "pB", quantidade: 3 }],
      PRODUTOS_MOCK
    );
    expect(r.totalAvista).toBe(2 * 200 + 3 * 50);       // 550
    expect(r.totalParcelado).toBe(2 * 240 + 3 * 60);    // 660
  });
});

// ---------------------------------------------------------------------------
// 3. stepAtivo
// ---------------------------------------------------------------------------

describe("stepAtivo", () => {
  it("dados e contrato são sempre ativos", () => {
    const t = templateBase();
    expect(stepAtivo("dados", t)).toBe(true);
    expect(stepAtivo("contrato", t)).toBe(true);
  });

  it("pagamento inativo sem preço configurado", () => {
    const t = templateBase();
    expect(stepAtivo("pagamento", t)).toBe(false);
  });

  it("pagamento ativo com preço > 0", () => {
    const t = templateBase();
    t.produtos_aceitos = [
      { produto_id: "pA", preco_avista: 100, parcelamento: { entrada: 0, max_parcelas: 1, valor_parcelado_total: 100 } },
    ];
    expect(stepAtivo("pagamento", t)).toBe(true);
  });

  it("comprovante inativo sem chave_pix nem link", () => {
    const t = templateBase();
    expect(stepAtivo("comprovante", t)).toBe(false);
  });

  it("comprovante ativo com chave_pix preenchida", () => {
    const t = templateBase();
    t.pagamento!.chave_pix = "12345678901";
    expect(stepAtivo("comprovante", t)).toBe(true);
  });

  it("selfie inativo por padrão", () => {
    const t = templateBase();
    expect(stepAtivo("selfie", t)).toBe(false);
  });

  it("selfie ativo quando ligado", () => {
    const t = templateBase();
    t.provas!.selfie = true;
    expect(stepAtivo("selfie", t)).toBe(true);
  });

  it("testemunha ativo quando ligado", () => {
    const t = templateBase();
    t.provas!.testemunha = true;
    expect(stepAtivo("testemunha", t)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. passoNumero
// ---------------------------------------------------------------------------

describe("passoNumero", () => {
  it("conta só passos ativos", () => {
    const t = templateBase();
    // Apenas dados e contrato ativos (pagamento/comprovante/provas inativos)
    const ordem = t.jornada_ordem;
    expect(passoNumero("dados", ordem, t)).toBe(1);
    expect(passoNumero("contrato", ordem, t)).toBe(2);
  });

  it("retorna 0 para step inativo", () => {
    const t = templateBase();
    expect(passoNumero("selfie", t.jornada_ordem, t)).toBe(0);
  });

  it("numera corretamente com todos ativos", () => {
    const t = templateBase();
    t.produtos_aceitos = [
      { produto_id: "pA", preco_avista: 100, parcelamento: { entrada: 0, max_parcelas: 1, valor_parcelado_total: 100 } },
    ];
    t.pagamento!.chave_pix = "pix123";
    t.provas!.selfie = true;
    t.provas!.documento = true;
    t.provas!.assinatura_manuscrita = true;
    t.provas!.testemunha = true;
    const ordem = t.jornada_ordem;
    expect(passoNumero("dados", ordem, t)).toBe(1);
    expect(passoNumero("pagamento", ordem, t)).toBe(2);
    expect(passoNumero("contrato", ordem, t)).toBe(3);
    expect(passoNumero("comprovante", ordem, t)).toBe(4);
    expect(passoNumero("selfie", ordem, t)).toBe(5);
    expect(passoNumero("documento", ordem, t)).toBe(6);
    expect(passoNumero("assinatura", ordem, t)).toBe(7);
    expect(passoNumero("testemunha", ordem, t)).toBe(8);
  });
});
