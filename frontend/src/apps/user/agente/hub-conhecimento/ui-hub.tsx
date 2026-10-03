/**
 * Componentes visuais do hub Conhecimento — fiéis à linguagem da casa
 * (glass roxo, FiltroPilulas gradiente, inline styles oklch, ícones lucide).
 * Upgrade 2026-07-05: press feedback (tapPress), busca com limpar, vazio com
 * dica de próximo passo, badge com ponto de cor — clareza pro tenant leigo.
 */

import type React from "react";
import { motion } from "framer-motion";
import { Inbox } from "lucide-react";
import { tapPress } from "@/os/motion/presets";
import { corEscopo, rotuloEscopo, type EscopoBloco } from "./gavetas";

export function Vazio({ mensagem, dica, pequeno }: { mensagem: string; dica?: string; pequeno?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: pequeno ? 18 : 48,
        gap: 8,
        color: "oklch(0.98 0 0 / 0.45)",
        textAlign: "center",
      }}
    >
      <Inbox size={pequeno ? 16 : 32} style={{ opacity: 0.35 }} aria-hidden="true" />
      <span style={{ fontSize: pequeno ? 11 : 13, fontWeight: 500 }}>{mensagem}</span>
      {dica && (
        <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.35)", maxWidth: 360, lineHeight: 1.5 }}>
          {dica}
        </span>
      )}
    </div>
  );
}


export function Campo({ label, dica, children }: { label: string; dica?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "oklch(0.98 0 0 / 0.55)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>
      {children}
      {dica && <span style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.4)", lineHeight: 1.4 }}>{dica}</span>}
    </label>
  );
}

export function BotaoIcone({
  children,
  onClick,
  titulo,
  perigo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  titulo: string;
  perigo?: boolean;
}) {
  return (
    <motion.button
      whileTap={tapPress}
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      style={{
        padding: 6,
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: 8,
        color: perigo ? "oklch(0.65 0.24 25)" : "oklch(0.98 0 0 / 0.55)",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </motion.button>
  );
}

export function FiltroPilulas({
  titulo,
  opcoes,
  ativo,
  onChange,
}: {
  titulo: string;
  opcoes: ReadonlyArray<{ id: string; rotulo: string; cont: number }>;
  ativo: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: "oklch(0.98 0 0 / 0.45)",
          width: 50,
        }}
      >
        {titulo}
      </span>
      {opcoes.map((opt) => {
        const on = ativo === opt.id;
        return (
          <motion.button
            whileTap={tapPress}
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 500,
              background: on
                ? "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.4), oklch(0.65 0.22 280 / 0.3))"
                : "oklch(0.98 0 0 / 0.05)",
              color: on ? "oklch(0.98 0 0)" : "oklch(0.98 0 0 / 0.55)",
              border: on
                ? "1px solid oklch(0.7 0.18 220 / 0.5)"
                : "1px solid oklch(0.98 0 0 / 0.06)",
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            <span>{opt.rotulo}</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 999,
                background: on ? "oklch(0.98 0 0 / 0.15)" : "oklch(0.98 0 0 / 0.07)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {opt.cont}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** etiqueta de escopo (Universo / Nicho / Você) com ponto de cor semântica */
export function BadgeEscopo({ escopo }: { escopo: EscopoBloco }) {
  const cor = corEscopo(escopo);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 999,
        color: cor,
        background: cor.replace(")", " / 0.12)"),
        border: `1px solid ${cor.replace(")", " / 0.3)")}`,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 5, height: 5, borderRadius: "50%", background: cor, display: "inline-block" }}
      />
      {rotuloEscopo(escopo)}
    </span>
  );
}

/** botão primário no estilo gradiente da casa */
export function BotaoPrimario({
  children,
  onClick,
  tipo = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tipo?: "button" | "submit";
}) {
  return (
    <motion.button
      whileTap={tapPress}
      type={tipo}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 16px",
        fontSize: 12,
        fontWeight: 600,
        color: "oklch(0.98 0 0)",
        background: "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.5), oklch(0.65 0.22 280 / 0.4))",
        border: "1px solid oklch(0.7 0.18 220 / 0.5)",
        borderRadius: 10,
        cursor: "pointer",
      }}
    >
      {children}
    </motion.button>
  );
}

/** input/textarea no padrão glass do hub */
export const estiloInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 12,
  color: "oklch(0.98 0 0)",
  background: "oklch(0.98 0 0 / 0.05)",
  border: "1px solid oklch(0.98 0 0 / 0.1)",
  borderRadius: 8,
  outline: "none",
  fontFamily: "inherit",
  resize: "vertical",
};
