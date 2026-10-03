// Camada de neblina aurora — fumaça lilás/azul compartilhada entre a tela de
// login (CommandBar descendo) e a tela de saída (CommandBar subindo).
//
// 12 neblinas grandes (blur alto, mix-blend screen) + 35 partículas de fumaça
// subindo continuamente. A opacidade do conjunto é controlada pelo pai via
// `visivel`: no login começa visível e some no sucesso; na saída começa
// invisível e cresce. Extraído de Login.tsx em 2026-05-23 pra evitar duplicação.
import { motion } from "framer-motion";

export const EASE = [0.22, 1, 0.36, 1] as const;

// ====================================================================
// NEBLINAS GRANDES — 12 camadas, alta opacidade, blur 80-150px,
// cobrindo a tela inteira pra criar uma atmosfera carregada de fumaça
// lilás+azul. mix-blend-mode aplicado por elemento pra somar cores
// no fundo escuro do wallpaper.
// ====================================================================

type Neblina = {
  cor: string;
  topPct: string;
  leftPct: string;
  sizePct: number;
  blur: number;
  duracao: number;
  delay: number;
  rotaInicial: number;
};

const NEBLINAS: Neblina[] = [
  { cor: "oklch(0.7 0.24 220 / 0.95)",  topPct: "-5%",  leftPct: "-10%", sizePct: 70, blur: 100, duracao: 22, delay: 0,  rotaInicial: 0 },
  { cor: "oklch(0.62 0.26 295 / 0.95)", topPct: "-15%", leftPct: "45%",  sizePct: 65, blur: 90,  duracao: 26, delay: 3,  rotaInicial: 25 },
  { cor: "oklch(0.72 0.22 240 / 0.85)", topPct: "25%",  leftPct: "-20%", sizePct: 75, blur: 110, duracao: 28, delay: 6,  rotaInicial: -15 },
  { cor: "oklch(0.6 0.24 285 / 0.95)",  topPct: "40%",  leftPct: "30%",  sizePct: 80, blur: 130, duracao: 30, delay: 9,  rotaInicial: 40 },
  { cor: "oklch(0.65 0.26 260 / 0.95)", topPct: "30%",  leftPct: "55%",  sizePct: 65, blur: 100, duracao: 24, delay: 2,  rotaInicial: 60 },
  { cor: "oklch(0.78 0.22 290 / 0.8)",  topPct: "-25%", leftPct: "20%",  sizePct: 75, blur: 140, duracao: 32, delay: 12, rotaInicial: -30 },
  { cor: "oklch(0.6 0.26 215 / 0.95)",  topPct: "55%",  leftPct: "60%",  sizePct: 60, blur: 100, duracao: 20, delay: 5,  rotaInicial: 90 },
  { cor: "oklch(0.55 0.24 280 / 0.9)",  topPct: "60%",  leftPct: "0%",   sizePct: 70, blur: 120, duracao: 27, delay: 7,  rotaInicial: 15 },
  { cor: "oklch(0.7 0.22 235 / 0.85)",  topPct: "10%",  leftPct: "65%",  sizePct: 60, blur: 110, duracao: 25, delay: 4,  rotaInicial: -45 },
  { cor: "oklch(0.65 0.26 300 / 0.9)",  topPct: "75%",  leftPct: "35%",  sizePct: 60, blur: 100, duracao: 23, delay: 8,  rotaInicial: 75 },
  { cor: "oklch(0.7 0.22 225 / 0.85)",  topPct: "80%",  leftPct: "70%",  sizePct: 55, blur: 100, duracao: 21, delay: 1,  rotaInicial: -60 },
  { cor: "oklch(0.6 0.26 270 / 0.95)",  topPct: "5%",   leftPct: "85%",  sizePct: 50, blur: 90,  duracao: 19, delay: 11, rotaInicial: 30 },
];

// ====================================================================
// PARTÍCULAS DE FUMAÇA — 35 pontos médios subindo continuamente do
// bottom ao topo, alternando azul e lilás em mistura natural.
// ====================================================================

type Particula = {
  cor: string;
  leftPct: number;
  sizePx: number;
  blur: number;
  duracao: number;
  delay: number;
  driftX: number;
};

const PARTICULAS: Particula[] = Array.from({ length: 35 }, (_, i) => {
  const hue = i % 2 === 0 ? 215 + (i * 7) % 25 : 270 + (i * 11) % 30;
  const lightness = 0.6 + (i % 5) * 0.04;
  const chroma = 0.22 + (i % 3) * 0.03;
  const alpha = 0.6 + (i % 4) * 0.1;
  return {
    cor: `oklch(${lightness} ${chroma} ${hue} / ${alpha})`,
    leftPct: (i * 100 / 35 + (i % 7) * 3.5) % 100,
    sizePx: 110 + (i * 13) % 130,
    blur: 35 + (i % 4) * 6,
    duracao: 16 + (i % 6) * 2,
    delay: -((i * 1.3) % 14),
    driftX: ((i % 5) - 2) * 50,
  };
});

type CamadaNeblinaProps = {
  // Controla a opacidade do conjunto inteiro. true = fumaça visível, false = some.
  visivel: boolean;
  // Duração (s) da transição de opacidade do conjunto (sincroniza com o CommandBar).
  duracao: number;
  // Se true, faz fade-in da fumaça no mount (saída). Se false, já nasce no valor (login).
  animarEntrada?: boolean;
  zIndex?: number;
};

export function CamadaNeblina({ visivel, duracao, animarEntrada = false, zIndex = 3 }: CamadaNeblinaProps) {
  return (
    <motion.div
      initial={animarEntrada ? { opacity: 0 } : false}
      animate={{ opacity: visivel ? 1 : 0 }}
      transition={{ duration: duracao, ease: EASE }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {NEBLINAS.map((n, i) => (
        <motion.div
          key={`neb-${i}`}
          // Neblinas nascem DENSAS (opacity ~0.9). O surgir/sumir do conjunto fica
          // por conta do container (`visivel`/`animarEntrada`) — assim a tela de
          // login já abre com fumaça densa e emenda no fim do logoff (ciclo).
          initial={{ x: 0, y: 0, scale: 1, rotate: n.rotaInicial, opacity: 0.9 }}
          animate={{
            x: [0, 70, -50, 40, 0],
            y: [0, -40, 50, -30, 0],
            scale: [1, 1.18, 0.94, 1.12, 1],
            rotate: [n.rotaInicial, n.rotaInicial + 35, n.rotaInicial - 25, n.rotaInicial + 18, n.rotaInicial],
            opacity: [0.9, 1, 0.85, 1, 0.9],
          }}
          transition={{
            duration: n.duracao,
            delay: n.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            top: n.topPct,
            left: n.leftPct,
            width: `${n.sizePct}vw`,
            height: `${n.sizePct}vw`,
            maxWidth: "80vmax",
            maxHeight: "80vmax",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${n.cor} 0%, transparent 70%)`,
            filter: `blur(${n.blur}px)`,
            mixBlendMode: "screen",
            willChange: "transform, opacity",
          }}
        />
      ))}

      {PARTICULAS.map((p, i) => (
        <motion.div
          key={`part-${i}`}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
          animate={{
            x: [0, p.driftX, -p.driftX * 0.5, p.driftX * 0.8, 0],
            y: ["0vh", "-30vh", "-60vh", "-90vh", "-120vh"],
            opacity: [0, 0.95, 1, 0.7, 0],
            scale: [0.5, 1, 1.25, 1.1, 0.7],
          }}
          transition={{
            duration: p.duracao,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
          style={{
            position: "absolute",
            bottom: -120,
            left: `${p.leftPct}%`,
            width: p.sizePx,
            height: p.sizePx,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${p.cor} 0%, transparent 65%)`,
            filter: `blur(${p.blur}px)`,
            mixBlendMode: "screen",
            willChange: "transform, opacity",
          }}
        />
      ))}
    </motion.div>
  );
}
