/**
 * Componente Wallpaper do Ragentic OS.
 *
 * Renderiza a aurora de fundo do desktop com crossfade animado quando
 * o usuário troca de preset (via Aparência ou /pref-ui).
 *
 * - Single source of truth do catálogo: src/os/wallpaper/wallpapers.ts
 * - Anim: dois layers absolutos com opacity cruzando (mais suave que
 *   trocar background-image direto, que causa flash)
 * - Reduced motion: respeitado via @media global em bundle.css §A11Y
 *
 * Auditoria: agent-output/auditorias-os/wallpaper-2026-05-13.md
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { duration, easing } from "@/os/motion/presets";
import {
  WALLPAPERS,
  WALLPAPER_DEFAULT_ID,
  aplicarPapelParedeNoDom,
  resolverWallpaper,
  type WallpaperPreset,
} from "./wallpapers";

interface WallpaperProps {
  /**
   * Id do preset ativo. Se omitido ou inválido, usa o default ("aurora").
   * Controlado externamente (pelo App.tsx + useBranding + preferências).
   */
  presetId?: string;
}

export function Wallpaper({ presetId }: WallpaperProps) {
  const [atual, setAtual] = useState<WallpaperPreset>(() =>
    resolverWallpaper(presetId ?? WALLPAPER_DEFAULT_ID),
  );
  const refMontado = useRef(false);

  // Injeta helpers em window pra preservar compat com bundle.jsx legado
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.RAGENTIC_WALLPAPERS = WALLPAPERS;
    window.aplicarPapelParede = (id: string): WallpaperPreset => {
      const aplicado = aplicarPapelParedeNoDom(id);
      setAtual(aplicado);
      return aplicado;
    };
  }, []);

  // Aplica CSS vars (--os-acento-1/2 + soft) sempre que o preset muda.
  // Primeiro mount: aplicar imediatamente sem animar.
  useEffect(() => {
    const novo = resolverWallpaper(presetId ?? atual.id);
    if (novo.id === atual.id && refMontado.current) return;
    refMontado.current = true;
    aplicarPapelParedeNoDom(novo.id);
    setAtual(novo);
  }, [presetId]);

  return (
    <div
      className="wallpaper-wrap"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={atual.id}
          className="wallpaper"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.slow, ease: easing.glass }}
          style={{
            position: "absolute",
            inset: 0,
            background: atual.bg,
            animation: "auroraDrift 40s ease-in-out infinite alternate",
            willChange: "background-position",
          }}
        />
      </AnimatePresence>

      {/* Neblina lilás animada — sobe e respira lentamente nos cantos.
          Pedido Theus 2026-05-13: "fumaça nos cantos puxando o lilás". */}
      <motion.div
        animate={{
          opacity: [0.55, 0.85, 0.55],
          scale: [1, 1.04, 1],
        }}
        transition={{
          duration: 14,
          ease: "easeInOut",
          repeat: Infinity,
        }}
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(40% 50% at 8% 12%, oklch(0.65 0.24 305 / 0.32), transparent 70%),
                       radial-gradient(45% 55% at 92% 88%, oklch(0.58 0.22 300 / 0.28), transparent 72%)`,
          filter: "blur(40px)",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* Grid overlay decorativo (vem do bundle.css .wallpaper::after) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
          mask: "radial-gradient(circle at 50% 55%, black 30%, transparent 90%)",
          WebkitMask:
            "radial-gradient(circle at 50% 55%, black 30%, transparent 90%)",
        }}
      />
    </div>
  );
}
