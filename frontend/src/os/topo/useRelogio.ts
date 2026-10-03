/**
 * Hook do relógio do Topo. Atualiza a cada 30s (suficiente — relógio mostra
 * só hora:minuto, não segundos).
 *
 * Extraído de bundle.jsx:331-338 (era inline em BarraSuperior).
 */

import { useEffect, useState } from "react";

interface FormatoRelogio {
  diaSemana: string; // "seg"
  diaMes: string; // "13 mai"
  horaMin: string; // "10:35"
}

function formatar(date: Date): FormatoRelogio {
  return {
    diaSemana: date
      .toLocaleDateString("pt-BR", { weekday: "short" })
      .replace(".", ""),
    diaMes: date
      .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
      .replace(".", ""),
    horaMin: date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

/**
 * Hook do relógio do Topo.
 *
 * Atualiza a cada 30 segundos por padrão — intervalo otimizado porque o
 * relógio mostra apenas `hh:mm` (sem segundos). Atualizações em 1s seriam
 * setState 60×/min × N abas = desperdício. 30s garante mudança de minuto
 * visível em < 30s sempre, sem CPU/re-render gratuito.
 *
 * Cleanup do interval no unmount via useEffect retorno.
 *
 * @param intervaloMs — só passar valor menor se realmente precisar segundos visíveis (ex: cronômetro)
 */
export function useRelogio(intervaloMs = 30_000): FormatoRelogio {
  const [agora, setAgora] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);

  return formatar(agora);
}

export const capitalizarPrimeira = (s: string): string =>
  s ? s[0]!.toUpperCase() + s.slice(1) : s;
