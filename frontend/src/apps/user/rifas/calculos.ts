/**
 * Cálculos puros do app Rifas — agregação de pedidos e preview de preço
 * com promoções gulosas (espelha a regra da RPC `reservar_numeros_rifa_publico`:
 * maior pacote primeiro, resto unitário).
 */

import type { PedidoRifa, PromocaoRifa, StatsRifa } from "./tipos";

type PedidoAgregavel = Pick<PedidoRifa, "id" | "rifa_id" | "status" | "qtd_numeros" | "valor_centavos" | "phone">;

const statsVazia = (): StatsRifa & { phonesPagos: Set<string> } => ({
  vendidos: 0,
  reservados: 0,
  arrecadadoCentavos: 0,
  participantes: 0,
  phonesPagos: new Set<string>(),
});

/** Agrega pedidos por rifa: pagos viram vendidos/arrecadado, reservas viram reservados. */
export function agregarStatsPedidos(pedidos: PedidoAgregavel[]): Map<string, StatsRifa> {
  const porRifa = new Map<string, ReturnType<typeof statsVazia>>();

  for (const p of pedidos) {
    const atual = porRifa.get(p.rifa_id) ?? statsVazia();
    if (p.status === "pago") {
      atual.vendidos += p.qtd_numeros;
      atual.arrecadadoCentavos += p.valor_centavos;
      // Número fixo sem telefone (2026-09-01) — não colapsa todo mundo numa
      // chave `null` só, senão participantes fica subcontado.
      atual.phonesPagos.add(p.phone ?? `sem-telefone-${p.id}`);
    } else if (p.status === "reservado" || p.status === "aguardando_validacao") {
      atual.reservados += p.qtd_numeros;
    }
    porRifa.set(p.rifa_id, atual);
  }

  const resultado = new Map<string, StatsRifa>();
  for (const [rifaId, s] of porRifa) {
    resultado.set(rifaId, {
      vendidos: s.vendidos,
      reservados: s.reservados,
      arrecadadoCentavos: s.arrecadadoCentavos,
      participantes: s.phonesPagos.size,
    });
  }
  return resultado;
}

/** Preço total em centavos aplicando promoções de forma gulosa (maior pacote primeiro). */
export function valorComPromocoes(
  qtd: number,
  precoUnitarioCentavos: number,
  promocoes: PromocaoRifa[],
): number {
  let resto = qtd;
  let total = 0;
  const ordenadas = [...promocoes].sort((a, b) => b.qtd - a.qtd);
  for (const promo of ordenadas) {
    while (promo.qtd > 0 && resto >= promo.qtd) {
      total += promo.preco_total_centavos;
      resto -= promo.qtd;
    }
  }
  return total + resto * precoUnitarioCentavos;
}
