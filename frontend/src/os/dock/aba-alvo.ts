/**
 * Ponte "ramo do dock → sub-aba exata do app" (2026-07-10).
 *
 * Ao clicar num ramo de sub-aba, `irParaAba` sinaliza a aba alvo de duas formas
 * (uma cobre cada caso):
 *  - `window.__RAGENTIC_ABA_ALVO`: lido no MOUNT do app (janela nova).
 *  - evento `ragentic:ir-para-aba`: capturado em RUNTIME (app já aberto → só
 *    troca de aba, não remonta).
 *
 * O app relevante chama `useAbaAlvo(slug, aplicar)` uma vez e recebe a aba.
 */

import { useEffect, useRef } from "react";

export interface AbaAlvo {
  slug: string;
  aba: string;
}

const EVENTO = "ragentic:ir-para-aba";

declare global {
  interface Window {
    __RAGENTIC_ABA_ALVO?: AbaAlvo;
  }
}

/** Clique no ramo: marca a aba alvo, abre/foca o app e avisa quem já está aberto. */
export function irParaAba(
  slug: string,
  aba: string,
  onLaunch: (slug: string) => void,
): void {
  window.__RAGENTIC_ABA_ALVO = { slug, aba };
  onLaunch(slug);
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { slug, aba } }));
}

/**
 * Hook do app: aplica a aba alvo no mount (payload pendente) e sempre que um
 * evento chegar pra este `slug`. `aplicar` pode ser inline — guardado em ref
 * pra o listener não re-registrar a cada render.
 */
export function useAbaAlvo(slug: string, aplicar: (aba: string) => void): void {
  const ref = useRef(aplicar);
  ref.current = aplicar;

  useEffect(() => {
    const pendente = window.__RAGENTIC_ABA_ALVO;
    if (pendente?.slug === slug) {
      ref.current(pendente.aba);
      window.__RAGENTIC_ABA_ALVO = undefined;
    }
    const handler = (e: Event) => {
      const d = (e as CustomEvent<AbaAlvo>).detail;
      if (d?.slug === slug) ref.current(d.aba);
    };
    window.addEventListener(EVENTO, handler);
    return () => window.removeEventListener(EVENTO, handler);
  }, [slug]);
}
