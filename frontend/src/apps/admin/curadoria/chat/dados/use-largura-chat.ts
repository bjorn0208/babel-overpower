/**
 * useLarguraChat — estado persistido da largura e colapso do chat lateral.
 *
 * Persiste em localStorage:
 *   "curadoria.chat.largura"   → number (pixels)
 *   "curadoria.chat.colapsado" → boolean
 */

import { useCallback, useEffect, useState } from "react";

export const LARGURA_MIN = 280;
export const LARGURA_MAX = 600;
export const LARGURA_DEFAULT = 380;
export const LARGURA_COLAPSADO = 52;

const CHAVE_LARGURA = "curadoria.chat.largura";
const CHAVE_COLAPSADO = "curadoria.chat.colapsado";

function lerLargura(): number {
  try {
    const v = localStorage.getItem(CHAVE_LARGURA);
    if (!v) return LARGURA_DEFAULT;
    const n = parseInt(v, 10);
    if (isNaN(n)) return LARGURA_DEFAULT;
    return Math.min(Math.max(n, LARGURA_MIN), LARGURA_MAX);
  } catch {
    return LARGURA_DEFAULT;
  }
}

function lerColapsado(): boolean {
  try {
    return localStorage.getItem(CHAVE_COLAPSADO) === "true";
  } catch {
    return false;
  }
}

export interface EstadoLarguraChat {
  largura: number;
  colapsado: boolean;
  setLargura: (n: number) => void;
  setColapsado: (b: boolean) => void;
  alternarColapsado: () => void;
}

export function useLarguraChat(): EstadoLarguraChat {
  const [largura, setLarguraState] = useState<number>(LARGURA_DEFAULT);
  const [colapsado, setColapsadoState] = useState<boolean>(false);

  // Carrega do localStorage no mount (evita hydration mismatch em SSR-like envs)
  useEffect(() => {
    setLarguraState(lerLargura());
    setColapsadoState(lerColapsado());
  }, []);

  const setLargura = useCallback((n: number) => {
    const clamped = Math.min(Math.max(n, LARGURA_MIN), LARGURA_MAX);
    setLarguraState(clamped);
    try {
      localStorage.setItem(CHAVE_LARGURA, String(clamped));
    } catch {
      // localStorage indisponível (modo privado, etc.) — só ignora
    }
  }, []);

  const setColapsado = useCallback((b: boolean) => {
    setColapsadoState(b);
    try {
      localStorage.setItem(CHAVE_COLAPSADO, String(b));
    } catch {
      // idem
    }
  }, []);

  const alternarColapsado = useCallback(() => {
    setColapsado(!colapsado);
  }, [colapsado, setColapsado]);

  return { largura, colapsado, setLargura, setColapsado, alternarColapsado };
}
