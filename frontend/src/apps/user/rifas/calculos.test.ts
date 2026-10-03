import { describe, expect, test } from "vitest";
import { agregarStatsPedidos, valorComPromocoes } from "./calculos";
import type { PedidoRifa } from "./tipos";

type PedidoParcial = Pick<PedidoRifa, "rifa_id" | "status" | "qtd_numeros" | "valor_centavos" | "phone">;

const pedido = (p: Partial<PedidoParcial>): PedidoParcial => ({
  rifa_id: "r1",
  status: "pago",
  qtd_numeros: 1,
  valor_centavos: 500,
  phone: "5599999990000",
  ...p,
});

describe("agregarStatsPedidos", () => {
  test("soma vendidos e arrecadado só de pedidos pagos", () => {
    const stats = agregarStatsPedidos([
      pedido({ qtd_numeros: 3, valor_centavos: 1500 }),
      pedido({ qtd_numeros: 2, valor_centavos: 1000, phone: "5599999990001" }),
    ]);
    expect(stats.get("r1")).toEqual({
      vendidos: 5,
      reservados: 0,
      arrecadadoCentavos: 2500,
      participantes: 2,
    });
  });

  test("reservado e aguardando_validacao contam como reservados, sem arrecadar", () => {
    const stats = agregarStatsPedidos([
      pedido({ status: "reservado", qtd_numeros: 4, valor_centavos: 2000 }),
      pedido({ status: "aguardando_validacao", qtd_numeros: 1, valor_centavos: 500 }),
    ]);
    expect(stats.get("r1")).toEqual({
      vendidos: 0,
      reservados: 5,
      arrecadadoCentavos: 0,
      participantes: 0,
    });
  });

  test("expirado, cancelado e rejeitado são ignorados", () => {
    const stats = agregarStatsPedidos([
      pedido({ status: "expirado", qtd_numeros: 2 }),
      pedido({ status: "cancelado", qtd_numeros: 2 }),
      pedido({ status: "rejeitado", qtd_numeros: 2 }),
    ]);
    expect(stats.get("r1")).toEqual({
      vendidos: 0,
      reservados: 0,
      arrecadadoCentavos: 0,
      participantes: 0,
    });
  });

  test("participantes conta phones distintos entre pagos", () => {
    const stats = agregarStatsPedidos([
      pedido({ phone: "5511988880000" }),
      pedido({ phone: "5511988880000" }),
      pedido({ phone: "5511988880001" }),
      pedido({ phone: "5511988880002", status: "reservado" }),
    ]);
    expect(stats.get("r1")?.participantes).toBe(2);
  });

  test("agrupa por rifa_id", () => {
    const stats = agregarStatsPedidos([
      pedido({ rifa_id: "r1", qtd_numeros: 1, valor_centavos: 500 }),
      pedido({ rifa_id: "r2", qtd_numeros: 7, valor_centavos: 3500, phone: "5511988880009" }),
    ]);
    expect(stats.get("r1")?.vendidos).toBe(1);
    expect(stats.get("r2")?.vendidos).toBe(7);
    expect(stats.get("r2")?.arrecadadoCentavos).toBe(3500);
  });
});

describe("valorComPromocoes", () => {
  test("sem promoção cobra qtd × preço unitário", () => {
    expect(valorComPromocoes(4, 500, [])).toBe(2000);
  });

  test("aplica o maior pacote primeiro e cobra o resto unitário", () => {
    // Caso real dos testes de aceitação da RPC: 12 números, promo 10 por R$ 40, unitário R$ 5 → R$ 50.
    expect(valorComPromocoes(12, 500, [{ qtd: 10, preco_total_centavos: 4000 }])).toBe(5000);
  });

  test("pacote se repete enquanto couber", () => {
    expect(valorComPromocoes(25, 500, [{ qtd: 10, preco_total_centavos: 4000 }])).toBe(
      2 * 4000 + 5 * 500,
    );
  });

  test("depois do pacote maior, encaixa o menor no resto", () => {
    const promos = [
      { qtd: 3, preco_total_centavos: 1200 },
      { qtd: 10, preco_total_centavos: 4000 },
    ];
    // 13 = 10 (4000) + 3 (1200) → 5200, independente da ordem do array.
    expect(valorComPromocoes(13, 500, promos)).toBe(5200);
  });
});
