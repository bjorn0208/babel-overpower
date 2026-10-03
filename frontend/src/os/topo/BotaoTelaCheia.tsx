/**
 * Botão de tela cheia do OS — pílula no topo que coloca a plataforma inteira
 * em fullscreen (API do navegador). Em tela cheia, o mesmo botão vira X pra sair.
 * Estado sincronizado pelo evento `fullscreenchange` — cobre também o Esc nativo.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { duration, easing } from "@/os/motion/presets";

const transHover = { duration: duration.fast, ease: easing.outExpo };

function IconeExpandir({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  );
}

function IconeX({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function BotaoTelaCheia() {
  const [emTelaCheia, setEmTelaCheia] = useState(
    typeof document !== "undefined" && !!document.fullscreenElement,
  );

  useEffect(() => {
    const sincronizar = () => setEmTelaCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sincronizar);
    return () => document.removeEventListener("fullscreenchange", sincronizar);
  }, []);

  const alternar = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn("[BotaoTelaCheia] navegador recusou tela cheia:", e);
    }
  };

  return (
    <motion.button
      className="bar-cluster"
      onClick={alternar}
      aria-label={emTelaCheia ? "Sair da tela cheia" : "Entrar em tela cheia"}
      title={emTelaCheia ? "Sair da tela cheia" : "Tela cheia"}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={transHover}
      style={{
        cursor: "pointer",
        padding: 0,
        width: 30,
        height: 30,
        justifyContent: "center",
      }}
    >
      {emTelaCheia ? <IconeX size={14} /> : <IconeExpandir size={14} />}
    </motion.button>
  );
}
