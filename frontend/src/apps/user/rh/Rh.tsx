/**
 * App RH — shell modular (mesmo idioma do app Financeiro).
 *
 * Duas abas: Funcionários (quadro da equipe com dados trabalhistas) e
 * Currículos (banco de talentos com aderência à vaga). Fase visual com
 * dados demo — liga na Equipe real + formulário de vagas depois.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { duration, easing, fadeSlideIn, tapPress } from "@/os/motion/presets";
import { AbaFuncionarios } from "./aba-funcionarios";
import { AbaCurriculos } from "./aba-curriculos";
import { CURRICULOS_DEMO, FUNCIONARIOS_DEMO } from "./dados-demo";

type Aba = "funcionarios" | "curriculos";

export function AppRh() {
  const [aba, setAba] = useState<Aba>("funcionarios");

  const abas: Array<{ id: Aba; rotulo: string }> = [
    { id: "funcionarios", rotulo: "Funcionários" },
    { id: "curriculos", rotulo: "Currículos" },
  ];

  return (
    <motion.div
      variants={fadeSlideIn}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", flexDirection: "column", height: "100%", padding: 18 }}
    >
      <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.98 0 0 / 0.08)", marginBottom: 16 }}>
        {abas.map((a) => {
          const ativa = aba === a.id;
          return (
            <motion.button
              key={a.id}
              type="button"
              whileTap={tapPress}
              onClick={() => setAba(a.id)}
              style={{
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: ativa ? 600 : 500,
                color: ativa ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.55)",
                background: ativa
                  ? "linear-gradient(180deg, oklch(0.7 0.18 220 / 0.12), oklch(0.65 0.22 280 / 0.08))"
                  : "transparent",
                border: "none",
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottom: ativa ? "2px solid oklch(0.7 0.18 220)" : "2px solid transparent",
                cursor: "pointer",
                transition: `color ${duration.normal} ${easing.glass}`,
              }}
            >
              {a.rotulo}
            </motion.button>
          );
        })}
      </nav>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <AnimatePresence mode="wait">
          {aba === "funcionarios" && <AbaFuncionarios key="funcionarios" funcionarios={FUNCIONARIOS_DEMO} />}
          {aba === "curriculos" && <AbaCurriculos key="curriculos" curriculos={CURRICULOS_DEMO} />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default AppRh;
