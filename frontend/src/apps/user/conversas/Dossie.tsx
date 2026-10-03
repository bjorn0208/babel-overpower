/**
 * Dossiê — painel direito da tela Conversas.
 *
 * 6 abas (skill impeccable distill: progressive disclosure):
 *  1. Quem (aba padrão ao abrir) — identidade + memória longa + linha do tempo
 *  2. Contrato (id interno `operacao`) — produto contratado + link de acompanhamento + editor de fluxo
 *  3. Compromissos — agendamentos
 *  4. Financeiro — contratos + pagamentos + link público
 *  5. Mente do Agente — pensamento + próximos atos + tags + dados + prancheta
 *  6. Agente — o que ele considerou no último turno (RAG, tools, contrato)
 *
 * WAI-ARIA tablist pattern (←/→ navega, role tab + tabpanel).
 */

import { useState, useId } from "react";
import { motion } from "framer-motion";
import { duration, easing, tapPress } from "@/os/motion/presets";
import type { AbaDossie, Conversa, MembroEquipe, PlanoTurno } from "./tipos";
import { AbaMente } from "./abas/AbaMente";
import { AbaQuem } from "./abas/AbaQuem";
import { AbaFinanceiro } from "./abas/AbaFinanceiro";
import { AbaOperacao } from "./abas/AbaOperacao";
import { AbaCompromissos } from "./abas/AbaCompromissos";
import { AbaAprendizado } from "./abas/AbaAprendizado";
import { AbaAgente } from "./abas/AbaAgente";

interface DossieProps {
  conversa: Conversa;
  /** Equipe real (profiles) — passada à AbaMente pro bloco Responsável. */
  equipe?: MembroEquipe[];
  onTrocarCargo?: () => void;
  onExecutarTurno?: (turno: PlanoTurno) => void;
  /** Troca o responsável (membro da equipe) da conversa — persiste no banco. */
  onAtribuirResponsavel?: (membroId: string | null) => void;
  /** Liga/pausa a IA desta conversa. */
  onToggleAgente?: (novo: boolean) => void;
  /** Largura em px controlada pelo pai (drag handle). Default 360. */
  /** UUID real da conversa quando `conversa.id` é mock (ex: ChatTeste cria conversa
   *  com id local `teste-${Date.now()}` antes do primeiro turno). Quando presente,
   *  as abas usam esse UUID nos RPCs em vez do `conversa.id`. Onda 2026-05-14. */
  conversaIdOverride?: string | null;
}

interface AbaConfig {
  id: AbaDossie;
  rotulo: string;
  icone: string;
}

const ABAS: readonly AbaConfig[] = [
  { id: "mente", rotulo: "Mente", icone: "🧠" },
  { id: "quem", rotulo: "Quem", icone: "👤" },
  { id: "operacao", rotulo: "Contrato", icone: "📝" },
  { id: "compromissos", rotulo: "Compromissos", icone: "📅" },
  { id: "financeiro", rotulo: "Financeiro", icone: "💰" },
  { id: "agente", rotulo: "Agente", icone: "🔎" },
];

export function Dossie({ conversa, equipe, onTrocarCargo, onExecutarTurno, onAtribuirResponsavel, onToggleAgente, conversaIdOverride }: DossieProps) {
  const [aba, setAba] = useState<AbaDossie>("mente");
  const tablistId = useId();

  const onKeyTablist = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = ABAS.findIndex((a) => a.id === aba);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const prox = ABAS[(idx + 1) % ABAS.length];
      setAba(prox.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const ant = ABAS[(idx - 1 + ABAS.length) % ABAS.length];
      setAba(ant.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      setAba(ABAS[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      setAba(ABAS[ABAS.length - 1].id);
    }
  };

  return (
    <aside
      style={{
        flex: "1 1 auto",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "rgba(15, 12, 30, 0.45)",
        borderLeft: "1px solid var(--os-vidro-borda, rgba(255,255,255,0.10))",
        minHeight: 0,
        // Defesa em profundidade contra overflow horizontal: sem minWidth:0 o
        // aside respeita min-content (tags tipo "apresentacao_concluida",
        // "perfil:negativado") e estoura a largura do Panel pai. overflow:hidden
        // recorta o que ainda escape.
        minWidth: 0,
        overflow: "hidden",
      }}
      aria-label="Dossiê do contato"
    >
      <div
        role="tablist"
        aria-label="Abas do dossiê"
        id={tablistId}
        onKeyDown={onKeyTablist}
        style={{
          display: "flex",
          gap: 2,
          padding: "8px 8px 0",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          // 5 abas com whiteSpace:nowrap somam mais que a largura do Panel
          // em telas estreitas (~230px). Sem isso o flex transborda e os
          // botões deslocam visualmente. Scroll horizontal vira fallback,
          // flexShrink:0 nas tabs garante que cada uma mantém seu tamanho.
          overflowX: "auto",
          flexShrink: 0,
          scrollbarWidth: "none",
        }}
      >
        {ABAS.map((a) => {
          const ativo = aba === a.id;
          return (
            <motion.button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={ativo}
              aria-controls={`${tablistId}-${a.id}-panel`}
              id={`${tablistId}-${a.id}-tab`}
              tabIndex={ativo ? 0 : -1}
              onClick={() => setAba(a.id)}
              whileTap={tapPress}
              whileHover={{ scale: 1.03, transition: { duration: duration.fast, ease: easing.outExpo } }}
              style={{
                background: "transparent",
                border: "none",
                padding: "8px 10px",
                fontSize: 12,
                fontWeight: ativo ? 600 : 500,
                color: ativo ? "var(--txt-1)" : "var(--txt-3)",
                cursor: "pointer",
                position: "relative",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span aria-hidden="true" style={{ marginRight: 4 }}>{a.icone}</span>
              {a.rotulo}
              {ativo && (
                <motion.span
                  layoutId="dossie-tab-indicator"
                  style={{
                    position: "absolute",
                    left: 8,
                    right: 8,
                    bottom: -1,
                    height: 2,
                    background: "linear-gradient(90deg, var(--os-acento-1, oklch(0.7 0.18 220)), var(--os-acento-2, oklch(0.65 0.22 280)))",
                    borderRadius: 2,
                  }}
                  transition={{ duration: duration.normal, ease: easing.outExpo }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Container de scroll ESTÁVEL: sem AnimatePresence/exit aqui — antes o
          painel saindo e o entrando coexistiam no mesmo box e o overflow media
          a altura errada, travando/saltando o scroll (bug relatado pelo Theus).
          A entrada de cada aba é animada DENTRO de cada Aba* (fadeSlideIn
          próprio). `key={aba}` remonta o painel → scroll volta ao topo na troca,
          que é o comportamento esperado. `position: relative` contém o overlay
          do EditorFluxo dentro do dossiê. */}
      <div
        className="scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          // Conteúdo das abas (tags, pílulas, identificadores snake_case)
          // pode ter min-content > largura do Panel. Sem overflowX:hidden o
          // texto longo dilata o aside e visualmente "vaza" pra fora do
          // painel. Aqui força respeitar a largura do Panel pai.
          overflowX: "hidden",
          position: "relative",
        }}
      >
        <div
          key={aba}
          role="tabpanel"
          id={`${tablistId}-${aba}-panel`}
          aria-labelledby={`${tablistId}-${aba}-tab`}
        >
            {aba === "mente" && (
              <AbaMente
                conversa={conversa}
                conversaIdOverride={conversaIdOverride}
                onTrocarCargo={onTrocarCargo}
                onExecutarTurno={onExecutarTurno}
              />
            )}
            {aba === "quem" && (
              <AbaQuem
                conversa={conversa}
                conversaIdOverride={conversaIdOverride}
                onIrParaAba={setAba}
                equipe={equipe}
                onAtribuirResponsavel={onAtribuirResponsavel}
                onToggleAgente={onToggleAgente}
              />
            )}
            {aba === "financeiro" && (
              <AbaFinanceiro conversa={conversa} conversaIdOverride={conversaIdOverride} />
            )}
            {aba === "operacao" && (
              <AbaOperacao conversa={conversa} conversaIdOverride={conversaIdOverride} />
            )}
            {aba === "compromissos" && (
              <AbaCompromissos conversa={conversa} conversaIdOverride={conversaIdOverride} />
            )}
            {aba === "agente" && (
              <AbaAgente conversa={conversa} conversaIdOverride={conversaIdOverride} />
            )}
            {aba === "aprendizado" && (
              <AbaAprendizado conversa={conversa} conversaIdOverride={conversaIdOverride} />
            )}
        </div>
      </div>
    </aside>
  );
}
