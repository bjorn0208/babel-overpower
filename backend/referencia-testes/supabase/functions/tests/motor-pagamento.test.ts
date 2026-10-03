/**
 * Testes do motor de pagamento determinístico.
 * Rodar: deno test supabase/functions/tests/motor-pagamento.test.ts
 *
 * Prova que o plano é sempre correto e que o valor da parcela NUNCA é null
 * (o bug que travou a liberação). Casos reais do tenant Limpa Nome inclusos.
 */

import { assertEquals } from "jsr:@std/assert@1";
import {
  calcularValorParcela,
  montarPlanoPagamento,
  montarOpcoesPorForma,
  type ItemPlano,
  type FormaPagamento,
} from "../_shared/motor-pagamento.ts";

const item = (nome: string, preco: number, parcelas = 1, entrada = 0, juros = 0): ItemPlano => ({
  produto_id: nome.toLowerCase().replaceAll(" ", "-"),
  nome,
  quantidade: 1,
  recurso: { preco_avista: preco, parcelas_max: parcelas, entrada, juros_mensal: juros },
});

Deno.test("à vista (sem parcelamento) → parcelado null", () => {
  const p = montarPlanoPagamento([item("Limpa Nome", 597, 1)]);
  assertEquals(p.total_avista, 597);
  assertEquals(p.parcelado, null);
});

Deno.test("1 produto 12x sem juros → 597 / 12 = 49.75", () => {
  const p = montarPlanoPagamento([item("Limpa Nome", 597, 12)]);
  assertEquals(p.total_avista, 597);
  assertEquals(p.parcelado?.parcelas, 12);
  assertEquals(p.parcelado?.valor_parcela, 49.75);
  assertEquals(p.parcelado?.total_parcelado, 597);
  assertEquals(p.parcelado?.cronograma.length, 12);
});

Deno.test("com entrada: 597, entrada 117, 5x sem juros → base 480, 5× de 96", () => {
  const p = montarPlanoPagamento([item("Limpa Nome", 597, 5, 117)]);
  assertEquals(p.parcelado?.entrada, 117);
  assertEquals(p.parcelado?.valor_parcela, 96);
  assertEquals(p.parcelado?.total_parcelado, 597); // 117 + 5×96
});

Deno.test("multi-produto (3 itens) — política maior teto → soma e parcela o total", () => {
  const p = montarPlanoPagamento(
    [item("Limpa Nome", 597, 12), item("Consulta", 300, 6), item("Recurso X", 200, 3)],
    "maior",
  );
  assertEquals(p.total_avista, 1097);
  assertEquals(p.itens.length, 3);
  assertEquals(p.parcelado?.parcelas, 12); // maior teto entre 12/6/3
  assertEquals(p.parcelado?.valor_parcela, 91.42); // 1097 / 12
});

Deno.test("multi-produto — política menor teto → 3x", () => {
  const p = montarPlanoPagamento(
    [item("Limpa Nome", 597, 12), item("Recurso X", 200, 3)],
    "menor",
  );
  assertEquals(p.parcelado?.parcelas, 3);
});

Deno.test("com juros (Price/PMT): 1000 em 10x a 2% a.m. → 111.33", () => {
  assertEquals(calcularValorParcela(1000, 10, 0.02), 111.33);
  const p = montarPlanoPagamento([item("Produto Juros", 1000, 10, 0, 0.02)]);
  assertEquals(p.parcelado?.valor_parcela, 111.33);
});

Deno.test("INVARIANTE: valor_parcela nunca é null/undefined/NaN quando parcela", () => {
  for (const parcelas of [2, 3, 6, 10, 12, 18, 24]) {
    const p = montarPlanoPagamento([item("X", 597, parcelas)]);
    const vp = p.parcelado?.valor_parcela;
    assertEquals(typeof vp, "number");
    assertEquals(Number.isFinite(vp as number), true);
    assertEquals((vp as number) > 0, true);
  }
});

Deno.test("quantidade multiplica o subtotal", () => {
  const p = montarPlanoPagamento([
    { produto_id: "x", nome: "X", quantidade: 3, recurso: { preco_avista: 100, parcelas_max: 1 } },
  ]);
  assertEquals(p.total_avista, 300);
});

Deno.test("carrinho vazio → total 0, parcelado null (não quebra)", () => {
  const p = montarPlanoPagamento([]);
  assertEquals(p.total_avista, 0);
  assertEquals(p.parcelado, null);
});

Deno.test("acréscimo de 10% no parcelado: 597 em 12x → 54.73", () => {
  const it: ItemPlano = {
    produto_id: "x", nome: "X", quantidade: 1,
    recurso: { preco_avista: 597, parcelas_max: 12, acrescimo_parcelado: 0.1 },
  };
  const p = montarPlanoPagamento([it]);
  assertEquals(p.parcelado?.valor_parcela, 54.73); // 597×1,10 ÷ 12
});

Deno.test("valor da parcela CRAVADO pelo dono tem prioridade (com fallback garantido)", () => {
  const it: ItemPlano = {
    produto_id: "x", nome: "X", quantidade: 1,
    recurso: { preco_avista: 597, parcelas_max: 12, valor_parcela_cravado: 60 },
  };
  const p = montarPlanoPagamento([it]);
  assertEquals(p.parcelado?.valor_parcela, 60);
  assertEquals(p.parcelado?.total_parcelado, 720); // 12 × 60
});

Deno.test("forma PIX com 5% de desconto à vista", () => {
  const op = montarOpcoesPorForma(597, [{ tipo: "pix", desconto_avista: 0.05 }]);
  assertEquals(op[0].tipo, "pix");
  assertEquals(op[0].avista, 567.15); // 597 × 0,95
  assertEquals(op[0].parcelado, null);
});

Deno.test("3 formas: PIX à vista c/ desconto, boleto 3x, cartão 12x", () => {
  const formas: FormaPagamento[] = [
    { tipo: "pix", desconto_avista: 0.05 },
    { tipo: "boleto", parcelas_max: 3 },
    { tipo: "cartao", parcelas_max: 12 },
  ];
  const op = montarOpcoesPorForma(597, formas);
  assertEquals(op.length, 3);
  assertEquals(op[0].avista, 567.15);
  assertEquals(op[1].parcelado?.valor_parcela, 199); // 597 ÷ 3
  assertEquals(op[2].parcelado?.valor_parcela, 49.75); // 597 ÷ 12
});

Deno.test("forma cartão com juros (Price): nunca null e dentro do esperado", () => {
  const op = montarOpcoesPorForma(1097, [{ tipo: "cartao", parcelas_max: 12, juros_mensal: 0.02 }]);
  const vp = op[0].parcelado?.valor_parcela as number;
  assertEquals(typeof vp, "number");
  assertEquals(vp > 100 && vp < 110, true); // PMT(1097,12,2%) ≈ 103,7
});
