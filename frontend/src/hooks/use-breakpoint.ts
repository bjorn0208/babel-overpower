import { useEffect, useState } from "react";

/**
 * Hook único de breakpoint (Fase 0 do plano de responsividade,
 * `agent-output/estrategias/responsividade-mobile-tablet-2026-08-28.md`).
 * Substitui as 3 implementações divergentes de "é mobile?" que coexistiam
 * na plataforma (`use-mobile.tsx` 768px, `TelaChamada.tsx` 640px estático
 * via matchMedia, `Rifas.tsx` 640px via window.innerWidth estático).
 *
 * 3 tiers reais — fecha a lacuna de tablet que nenhuma das 3 cobria.
 * `matchMedia` reativo (não `window.innerWidth` estático): resize/orientação
 * atualizam sozinhos.
 */

export type BreakpointTier = "mobile" | "tablet" | "desktop";

const LARGURA_MOBILE_MAX = 639;
const LARGURA_TABLET_MAX = 1023;

function tierPorLargura(largura: number): BreakpointTier {
  if (largura <= LARGURA_MOBILE_MAX) return "mobile";
  if (largura <= LARGURA_TABLET_MAX) return "tablet";
  return "desktop";
}

export type UseBreakpointResultado = {
  tier: BreakpointTier;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Dispositivo de ponteiro grosso (dedo) — pra decisões de touch (zoom/pan), não de layout. */
  isTouch: boolean;
};

export function useBreakpoint(): UseBreakpointResultado {
  const [largura, setLargura] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : LARGURA_TABLET_MAX + 1,
  );
  const [isTouch, setIsTouch] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(pointer: coarse)").matches : false,
  );

  useEffect(() => {
    const mqMobile = window.matchMedia(`(max-width: ${LARGURA_MOBILE_MAX}px)`);
    const mqTablet = window.matchMedia(`(max-width: ${LARGURA_TABLET_MAX}px)`);
    const mqTouch = window.matchMedia("(pointer: coarse)");

    const atualizarLargura = () => setLargura(window.innerWidth);
    const atualizarTouch = () => setIsTouch(mqTouch.matches);

    mqMobile.addEventListener("change", atualizarLargura);
    mqTablet.addEventListener("change", atualizarLargura);
    mqTouch.addEventListener("change", atualizarTouch);
    window.addEventListener("orientationchange", atualizarLargura);

    atualizarLargura();
    atualizarTouch();

    return () => {
      mqMobile.removeEventListener("change", atualizarLargura);
      mqTablet.removeEventListener("change", atualizarLargura);
      mqTouch.removeEventListener("change", atualizarTouch);
      window.removeEventListener("orientationchange", atualizarLargura);
    };
  }, []);

  const tier = tierPorLargura(largura);

  return {
    tier,
    isMobile: tier === "mobile",
    isTablet: tier === "tablet",
    isDesktop: tier === "desktop",
    isTouch,
  };
}

/**
 * Override manual persistido (padrão do Rifa: botão "📱 Modo celular" que
 * liga/desliga independente da largura real). Composto sobre `useBreakpoint`
 * — o app decide se quer esse comportamento (Rifa quer; Reunião não).
 */
export function useModoCelularManual(chaveStorage: string) {
  const { isMobile: ehMobilePelaLargura } = useBreakpoint();

  const [override, setOverride] = useState<boolean | null>(() => {
    try {
      const salvo = localStorage.getItem(chaveStorage);
      if (salvo === "1") return true;
      if (salvo === "0") return false;
    } catch {
      /* storage bloqueado */
    }
    return null;
  });

  const modoCelular = override ?? ehMobilePelaLargura;

  const alternar = () => {
    setOverride((atual) => {
      const proximo = !(atual ?? ehMobilePelaLargura);
      try {
        localStorage.setItem(chaveStorage, proximo ? "1" : "0");
      } catch {
        /* ok */
      }
      return proximo;
    });
  };

  return { modoCelular, alternar };
}
