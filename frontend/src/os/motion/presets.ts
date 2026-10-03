/**
 * Motion presets canônicos do Plataforma Limpa Ragentic OS.
 *
 * Fonte da verdade: docs/design-system/00-tokens.md §8.
 * Filosofia Emil Kowalski: motion serve clareza, < 300ms, easing custom.
 *
 * Toda animação no OS DEVE consumir um preset daqui. Se precisar de novo
 * preset, adicionar aqui primeiro + atualizar o doc.
 */

import type { Transition, Variants } from "framer-motion";

// ============================================================================
// DURAÇÕES (segundos — framer-motion usa segundos, CSS usa ms)
// ============================================================================

export const duration = {
  instant: 0.08, // 80ms — toggle, fb tátil
  fast: 0.15, // 150ms — hover, focus, input feedback
  normal: 0.24, // 240ms — botão, badge, padrão
  slow: 0.36, // 360ms — janela, modal
  page: 0.48, // 480ms — transição entre rotas
} as const;

// ============================================================================
// EASINGS (cubic-bezier)
// ============================================================================

export const easing = {
  outExpo: [0.16, 1, 0.3, 1] as const, // entrada — elemento aparecendo
  inExpo: [0.7, 0, 0.84, 0] as const, // saída — elemento sumindo
  glass: [0.32, 0.72, 0, 1] as const, // UI glass smooth
  springSoft: [0.2, 0.9, 0.3, 1.2] as const, // janela aparecendo (overshoot leve)
  springBouncy: [0.34, 1.56, 0.64, 1] as const, // badge, notificação
} as const;

// ============================================================================
// SPRINGS (framer-motion spring config)
// ============================================================================

export const springSoft: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 22,
  mass: 0.8,
};

export const springBouncy: Transition = {
  type: "spring",
  stiffness: 340,
  damping: 18,
  mass: 0.6,
};

export const springGentle: Transition = {
  type: "spring",
  stiffness: 180,
  damping: 26,
  mass: 1,
};

export const springSnap: Transition = {
  type: "spring",
  stiffness: 480,
  damping: 30,
  mass: 0.5,
};

// ============================================================================
// VARIANTS PRONTOS (framer-motion variants)
// ============================================================================

/**
 * Fade + slide curto (8px). Padrão pra entrada de elementos em listas,
 * popovers, badges. Sutil, sem chamar atenção.
 */
export const fadeSlideIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easing.outExpo },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: duration.fast, ease: easing.inExpo },
  },
};

/**
 * Scale + fade para entrada de janelas, modais, popovers grandes.
 * Overshoot leve via spring.
 */
export const windowEnter: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springSoft,
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: duration.fast, ease: easing.inExpo },
  },
};

/**
 * Reveal de glass com blur invertido — o conteúdo aparece de "fora do foco"
 * pra foco nítido. Usar com moderação (Spotlight, MissionControl, Launchpad).
 */
export const glassReveal: Variants = {
  hidden: { opacity: 0, filter: "blur(8px)", scale: 0.98 },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    scale: 1,
    transition: { duration: duration.slow, ease: easing.glass },
  },
  exit: {
    opacity: 0,
    filter: "blur(8px)",
    scale: 0.98,
    transition: { duration: duration.fast, ease: easing.inExpo },
  },
};

/**
 * Slide de notificação chegando do canto. Direção dinâmica.
 * Usar via `direction: "right" | "top"`.
 */
export const notificationSlide = (
  direction: "right" | "top" = "right",
): Variants => {
  const offset = direction === "right" ? { x: 32, y: 0 } : { x: 0, y: -16 };
  return {
    hidden: { opacity: 0, ...offset },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: springBouncy,
    },
    exit: {
      opacity: 0,
      ...offset,
      transition: { duration: duration.fast, ease: easing.inExpo },
    },
  };
};

/**
 * Stagger container — pai que escalona entradas dos filhos.
 * Usar em listas (Spotlight results, Launchpad grid, Dock dock-items).
 */
export const stagger = (
  delayChildren = 0.04,
  staggerChildren = 0.04,
): Variants => ({
  hidden: {},
  visible: {
    transition: {
      delayChildren,
      staggerChildren,
    },
  },
});

/**
 * Item dentro de um stagger container — recebe ordem pelo pai.
 */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easing.outExpo },
  },
};

/**
 * Pulse sutil para chamar atenção (badge novo, notificação fresh).
 * Repete 2 vezes só, depois para.
 */
export const attentionPulse: Variants = {
  initial: { scale: 1, opacity: 1 },
  animate: {
    scale: [1, 1.06, 1],
    opacity: [1, 0.85, 1],
    transition: {
      duration: 0.6,
      ease: easing.outExpo,
      times: [0, 0.5, 1],
      repeat: 1,
    },
  },
};

/**
 * Hover lift — card subindo levemente no hover (usar com sombra +).
 * Aplicar via whileHover.
 */
export const hoverLift = {
  scale: 1.015,
  y: -2,
  transition: { duration: duration.fast, ease: easing.outExpo },
};

/**
 * Tap press — feedback de clique. Aplicar via whileTap.
 */
export const tapPress = {
  scale: 0.97,
  transition: { duration: duration.instant, ease: easing.outExpo },
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Respeitar prefers-reduced-motion. Se o usuário pediu motion reduzido,
 * retorna transição instantânea. Caso contrário, retorna a passada.
 */
export function reducedMotionSafe(transition: Transition): Transition {
  if (typeof window === "undefined") return transition;
  const prefers = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefers) return transition;
  return { duration: 0.01 };
}

/**
 * Converter token de duração CSS (ms) pra framer-motion (s).
 * Útil quando ler de uma var CSS dinâmica.
 */
export const ms = (milliseconds: number): number => milliseconds / 1000;
