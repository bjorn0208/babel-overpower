// Tela de saída · espelho invertido do Login (Porteiro se despedindo).
//
// Ao deslogar, em vez de cortar direto pra tela de login, a fumaça lilás/azul
// surge sobre o desktop e o CommandBar sobe da base até o centro (~7s),
// sumindo na neblina. Termina com a fumaça densa e o bar no centro — emenda
// exata no estado inicial da tela de login. Só então o `onConcluir` desloga
// de fato e navega pra /login.
//
// CommandBar aqui é DECORATIVO (input desabilitado) — é só a continuidade
// visual do bar real do desktop subindo. Reusa a neblina de `neblina-aurora`.
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { Branding } from "@/branding/useBranding";
import { CamadaNeblina, EASE } from "./neblina-aurora";
import { usePosicaoCommandBar } from "./commandbar-posicao";

// Subida BEM lenta, igual a descida do login (simetria cravada com o Theus).
const DURACAO_SUBIDA_S = 7;
// Conclui (desloga + navega) logo após a subida + respiro.
const DELAY_CONCLUIR_MS = 7500;
// A fumaça sobe pra densa mais rápido que a subida, pra já estar carregada
// quando o bar chega no centro e emendar na tela de login.
const DURACAO_NEBLINA_S = 3.5;

const DESPEDIDAS = [
  "até mais. deixo o portão encostado pra quando voltar.",
  "vai com calma. tô aqui quando precisar.",
  "fechando por aqui. volta logo.",
  "pode ir tranquilo, eu cuido da casa. até a próxima.",
  "boa. descansa que eu fico de olho no portão.",
];

function escolher<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function TelaSaida({
  onConcluir,
  brand,
}: {
  onConcluir: () => void;
  // brand vem do Desktop (que já tem o useBranding). A tela de saída é efêmera
  // e NÃO chama useBranding — senão abriria um 2º channel realtime de nome fixo
  // simultâneo ao do Desktop e o Supabase estoura no .subscribe().
  brand: Branding;
}) {
  const despedida = useMemo(() => escolher(DESPEDIDAS), []);

  // Mesmo hook do login → o bar nasce na base (topBase, == bar do desktop) e
  // sobe pro centro (topCentro). Usar a MESMA conta é o que fecha o ciclo.
  const { refBarra, topCentro, topBase } = usePosicaoCommandBar();

  // `subindo` liga transição + move o bar pro centro APÓS o 1º paint na base,
  // pra a animação acontecer (sem isso o bar já nasceria no centro).
  const [subindo, setSubindo] = useState(false);
  // Bolha de despedida entra com leve atraso, como no login.
  const [mostrarBolha, setMostrarBolha] = useState(false);

  useEffect(() => {
    document.title = `Saindo — ${brand.nome_produto}`;
  }, [brand.nome_produto]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setSubindo(true));
    const tBolha = window.setTimeout(() => setMostrarBolha(true), 500);
    const tFim = window.setTimeout(() => onConcluir(), DELAY_CONCLUIR_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tBolha);
      window.clearTimeout(tFim);
    };
  }, [onConcluir]);

  const topAtual = subindo ? topCentro : topBase;
  // Distância base→centro (positiva): usada pra posicionar o rastro de bolinhas.
  const yStart = topBase - topCentro;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      style={{ position: "fixed", inset: 0, zIndex: 9000 }}
    >
      {/* Wallpaper aurora — mesmo do Desktop e do Login (fundo contínuo).
          O fade-in cruza com o desktop: as janelas somem enquanto a fumaça surge. */}
      <div className="wallpaper" />

      {/* Logo + nome no canto superior direito (espelho do login). */}
      <div
        style={{
          position: "fixed",
          top: 24,
          right: 28,
          display: "flex",
          alignItems: "center",
          gap: 10,
          zIndex: 2,
          pointerEvents: "none",
        }}
      >
        {brand.logo_url ? (
          <img
            src={brand.logo_url}
            alt={brand.nome_produto}
            style={{ width: 32, height: 32, objectFit: "contain", opacity: 0.95 }}
          />
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 12,
              color: "white",
              background:
                "linear-gradient(135deg, var(--os-acento-1), var(--os-acento-2))",
              boxShadow: "0 4px 14px oklch(0.65 0.22 280 / 0.4)",
              letterSpacing: 0.5,
            }}
          >
            {(brand.nome_curto || "PL").slice(0, 2).toUpperCase()}
          </div>
        )}
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "rgba(255,255,255,0.92)",
            letterSpacing: 0.2,
            textShadow: "0 2px 12px rgba(0,0,0,0.4)",
          }}
        >
          {brand.nome_produto}
        </div>
      </div>

      {/* Neblina aurora — surge sobre o desktop (fade-in) e fica densa no fim. */}
      <CamadaNeblina visivel duracao={DURACAO_NEBLINA_S} animarEntrada />

      {/* Bolha de despedida do porteiro, logo acima do centro (onde o bar chega). */}
      <div
        style={{
          position: "fixed",
          left: "50%",
          top: "calc(50% - 60px)",
          transform: "translate(-50%, -100%)",
          width: "min(720px, 78vw)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 9035,
          pointerEvents: "none",
        }}
      >
        {mostrarBolha && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="cmd-msg mentor"
            style={{ alignItems: "flex-start" }}
          >
            <div className="bolha-in">
              <div
                style={{
                  fontSize: 10,
                  opacity: 0.5,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 2,
                }}
              >
                porteiro
              </div>
              {despedida}
            </div>
          </motion.div>
        )}
      </div>

      {/* CommandBar decorativo subindo · CSS transition no `top` em pixels puros,
          espelho do login. A transição liga junto com `subindo` (após 1º paint). */}
      <div
        style={{
          position: "fixed",
          top: `${topAtual}px`,
          left: "50%",
          transform: "translate(-50%, -50%)",
          transition: subindo
            ? `top ${DURACAO_SUBIDA_S}s cubic-bezier(0.22, 1, 0.36, 1)`
            : "none",
          zIndex: 9036,
          pointerEvents: "none",
          willChange: "top",
        }}
      >
        <div
          ref={refBarra}
          style={{
            width: 720,
            maxWidth: "78vw",
            // padding 0: mesma altura do bar do desktop (72px) pra encaixar.
            padding: 0,
            borderRadius: 24,
            overflow: "hidden",
            isolation: "isolate",
            position: "relative",
          }}
        >
          <div
            className="cmd-shell"
            style={{
              position: "relative",
              left: "auto",
              transform: "none",
              bottom: "auto",
              width: "auto",
              maxWidth: "none",
            }}
          >
            <div className="cmd-inner">
              <input
                type="password"
                value=""
                readOnly
                disabled
                placeholder=""
                aria-hidden="true"
                tabIndex={-1}
              />
              <button type="button" className="btn-send" disabled aria-hidden="true">
                <Loader2 size={16} className="animate-spin" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Rastro de bolinhas subindo junto com o bar (base → centro). */}
      {Array.from({ length: 18 }).map((_, i) => {
        const frac = i / 17;
        const offsetY = (1 - frac) * yStart;
        const delay = frac * DURACAO_SUBIDA_S * 0.92;
        const tamanho = 10 + (i % 4) * 4;
        const hue = i % 2 === 0 ? 225 + (i % 4) * 5 : 280 + (i % 5) * 4;
        return (
          <motion.div
            key={`trail-${i}`}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 1, 0.7, 0], scale: [0.3, 1.2, 1, 0.5] }}
            transition={{ duration: 3, delay, ease: "easeOut" }}
            style={{
              position: "fixed",
              top: `calc(50% + ${offsetY}px - ${tamanho / 2}px)`,
              left: "50%",
              marginLeft: -tamanho / 2,
              width: tamanho,
              height: tamanho,
              borderRadius: "50%",
              background: `radial-gradient(circle, oklch(0.78 0.24 ${hue}) 0%, oklch(0.65 0.26 ${hue} / 0.6) 50%, transparent 75%)`,
              boxShadow: `0 0 ${tamanho * 1.5}px oklch(0.7 0.24 ${hue} / 0.7)`,
              mixBlendMode: "screen",
              pointerEvents: "none",
              zIndex: 9035,
              willChange: "opacity, transform",
            }}
          />
        );
      })}
    </motion.div>
  );
}
