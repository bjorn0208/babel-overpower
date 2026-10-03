/**
 * Componentes de UI compartilhados do app Consulta.
 * Campo, Vazio, CardKpi, BotaoIcone, FiltroPilulas, Linha.
 * Clone de ui-contratos.tsx adaptado para o domínio Consulta.
 */

import type React from "react";
import { Inbox } from "lucide-react";

// ---------------------------------------------------------------------------
// Campo — label + filho
// ---------------------------------------------------------------------------

export function Campo({ label, children }: { label: string; children: React.ReactNode }) {
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
    </label>
  );
}

// ---------------------------------------------------------------------------
// Vazio — estado vazio padronizado
// ---------------------------------------------------------------------------

export function Vazio({ mensagem, pequeno }: { mensagem: string; pequeno?: boolean }) {
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
      }}
    >
      <Inbox size={pequeno ? 16 : 32} style={{ opacity: 0.35 }} />
      <span style={{ fontSize: pequeno ? 10 : 12 }}>{mensagem}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardKpi — métrica com cor
// ---------------------------------------------------------------------------

export function CardKpi({
  rotulo,
  valor,
  cor,
  formatado,
}: {
  rotulo: string;
  valor: number;
  cor: string;
  formatado?: string;
}) {
  const corBorda = cor.endsWith(")") ? cor.replace(")", " / 0.25)") : cor;
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: "oklch(0.18 0.06 280 / 0.4)",
        border: `1px solid ${corBorda}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "oklch(0.98 0 0 / 0.55)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {rotulo}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: cor,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          lineHeight: 1.1,
        }}
      >
        {formatado ?? valor}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BotaoIcone — botão ícone compacto
// ---------------------------------------------------------------------------

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
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      style={{
        padding: 5,
        background: "transparent",
        border: "none",
        borderRadius: 6,
        color: perigo ? "oklch(0.65 0.24 25)" : "oklch(0.98 0 0 / 0.55)",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// FiltroPilulas — filtros em pílulas clicáveis
// ---------------------------------------------------------------------------

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
          <button
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
              }}
            >
              {opt.cont}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linha — par chave/valor em grid de detalhe
// ---------------------------------------------------------------------------

export function Linha({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: 9,
          color: "oklch(0.98 0 0 / 0.45)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {k}
      </span>
      <span style={{ fontSize: 11, color: "oklch(0.98 0 0)" }}>{v}</span>
    </div>
  );
}
