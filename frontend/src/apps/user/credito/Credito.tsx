/**
 * App Crédito Bancário — shell modular (mesmo idioma do app Financeiro).
 *
 * O usuário solicita crédito e a Babel captura e corre os bancos.
 * Fase visual: solicitação entra na lista local (etapa "recebida") e o
 * app troca pro acompanhamento com toast de confirmação. Persistência
 * real + aviso pro time da Babel são o tijolo seguinte.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { duration, easing, fadeSlideIn, tapPress } from "@/os/motion/presets";
import { AbaSolicitar } from "./aba-solicitar";
import { AbaAcompanhamento } from "./aba-acompanhamento";
import { SOLICITACOES_DEMO, type SolicitacaoCredito } from "./dados-demo";

type Aba = "solicitar" | "acompanhamento";

type ToastApi = { success: (m: string) => void };

// Toast resolvido em runtime — mesmo padrão do app Financeiro/Consulta.
function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {} };
}

export function AppCredito() {
  const t = pegarToast();
  const [aba, setAba] = useState<Aba>("acompanhamento");
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoCredito[]>(SOLICITACOES_DEMO);

  const receberSolicitacao = (s: SolicitacaoCredito) => {
    setSolicitacoes((lista) => [s, ...lista]);
    setAba("acompanhamento");
    t.success("Solicitação enviada — a Babel já recebeu e vai correr os bancos.");
  };

  const abas: Array<{ id: Aba; rotulo: string }> = [
    { id: "acompanhamento", rotulo: "Acompanhamento" },
    { id: "solicitar", rotulo: "Solicitar crédito" },
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
          {aba === "acompanhamento" && <AbaAcompanhamento key="acompanhamento" solicitacoes={solicitacoes} />}
          {aba === "solicitar" && <AbaSolicitar key="solicitar" onEnviar={receberSolicitacao} />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default AppCredito;
