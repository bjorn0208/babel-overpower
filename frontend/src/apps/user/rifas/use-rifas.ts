/**
 * Hook central do app Rifas: carrega rifas + pedidos do tenant, deriva as
 * stats por rifa (client-side) e escuta mudanças em tempo real.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { agregarStatsPedidos } from "./calculos";
import { assinarMudancas, listarPedidos, listarRifas } from "./dados-rifas";
import type { PedidoRifa, Rifa, StatsRifa } from "./tipos";

const STATS_ZERADA: StatsRifa = { vendidos: 0, reservados: 0, arrecadadoCentavos: 0, participantes: 0 };

export interface DadosRifas {
  rifas: Rifa[];
  pedidos: PedidoRifa[];
  statsDe: (rifaId: string) => StatsRifa;
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useRifas(): DadosRifas {
  const [rifas, setRifas] = useState<Rifa[]>([]);
  const [pedidos, setPedidos] = useState<PedidoRifa[]>([]);
  const [stats, setStats] = useState<Map<string, StatsRifa>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const vivo = useRef(true);

  const recarregar = useCallback(async () => {
    // Vigia + retentativas: logo após uma migration o PostgREST recarrega o
    // schema e a 1ª consulta pode ficar presa sem resolver nem rejeitar —
    // incidente 2026-08-20: o app ficou em "Carregando rifas…" eterno.
    // O vigia abandona a consulta lenta e tenta de novo; na 3ª falha mostra erro.
    const VIGIA_MS = 10_000;
    const TENTATIVAS = 3;
    const comVigia = <T,>(p: Promise<T>): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, rejeitar) =>
          setTimeout(() => rejeitar(new Error("O banco demorou a responder — tentando de novo…")), VIGIA_MS),
        ),
      ]);

    try {
      for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
        try {
          const [listaRifas, listaPedidos] = await comVigia(Promise.all([listarRifas(), listarPedidos()]));
          if (!vivo.current) return;
          setRifas(listaRifas);
          setPedidos(listaPedidos);
          setStats(agregarStatsPedidos(listaPedidos));
          setErro(null);
          return;
        } catch (e) {
          if (!vivo.current) return;
          if (tentativa === TENTATIVAS) {
            setErro(e instanceof Error ? e.message : String(e));
          } else {
            await new Promise((r) => setTimeout(r, 2500));
          }
        }
      }
    } finally {
      if (vivo.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    void recarregar();

    let limpar: (() => void) | null = null;
    void assinarMudancas(() => void recarregar()).then((fn) => {
      if (vivo.current) limpar = fn;
      else fn();
    });

    return () => {
      vivo.current = false;
      limpar?.();
    };
  }, [recarregar]);

  const statsDe = useCallback((rifaId: string) => stats.get(rifaId) ?? STATS_ZERADA, [stats]);

  return { rifas, pedidos, statsDe, carregando, erro, recarregar };
}
