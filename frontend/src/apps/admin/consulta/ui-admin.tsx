/**
 * Componentes de UI compartilhados do app admin de Consulta.
 * Clone enxuto de ui-contratos.tsx — Campo, Vazio, BotaoIcone, Toggle.
 */

import { Inbox } from "lucide-react";
import type React from "react";

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
// BotaoIcone — botão ícone compacto
// ---------------------------------------------------------------------------

export function BotaoIcone({
  children,
  onClick,
  titulo,
  perigo,
  desabilitado,
}: {
  children: React.ReactNode;
  onClick: () => void;
  titulo: string;
  perigo?: boolean;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      disabled={desabilitado}
      style={{
        padding: 5,
        background: "transparent",
        border: "none",
        borderRadius: 6,
        color: perigo ? "oklch(0.65 0.24 25)" : "oklch(0.98 0 0 / 0.55)",
        cursor: desabilitado ? "not-allowed" : "pointer",
        opacity: desabilitado ? 0.4 : 1,
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toggle — checkbox estilizado
// ---------------------------------------------------------------------------

export function Toggle({
  ativo,
  onChange,
  rotulo,
}: {
  ativo: boolean;
  onChange: (v: boolean) => void;
  rotulo: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        fontSize: 12,
        color: "oklch(0.98 0 0 / 0.8)",
      }}
    >
      <div
        onClick={() => onChange(!ativo)}
        style={{
          width: 32,
          height: 18,
          borderRadius: 999,
          background: ativo
            ? "linear-gradient(135deg, oklch(0.7 0.18 220), oklch(0.65 0.22 280))"
            : "oklch(0.98 0 0 / 0.1)",
          border: "1px solid oklch(0.98 0 0 / 0.12)",
          position: "relative",
          transition: "background 0.2s ease",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "oklch(0.98 0 0)",
            position: "absolute",
            top: 2,
            left: ativo ? 16 : 2,
            transition: "left 0.2s ease",
          }}
        />
      </div>
      {rotulo}
    </label>
  );
}

// ---------------------------------------------------------------------------
// BadgeStatus — badge colorido de status
// ---------------------------------------------------------------------------

export function BadgeStatus({ status }: { status: string }) {
  const mapa: Record<string, { rotulo: string; cor: string; fundo: string }> = {
    aguardando: { rotulo: "Aguardando", cor: "oklch(0.78 0.18 80)", fundo: "oklch(0.78 0.18 80 / 0.15)" },
    comprovante_enviado: { rotulo: "Comprovante enviado", cor: "oklch(0.7 0.18 220)", fundo: "oklch(0.7 0.18 220 / 0.15)" },
    aprovado: { rotulo: "Aprovado", cor: "oklch(0.72 0.18 145)", fundo: "oklch(0.72 0.18 145 / 0.15)" },
    recusado: { rotulo: "Recusado", cor: "oklch(0.65 0.24 25)", fundo: "oklch(0.65 0.24 25 / 0.15)" },
  };
  const b = mapa[status] ?? { rotulo: status, cor: "oklch(0.98 0 0 / 0.55)", fundo: "oklch(0.98 0 0 / 0.05)" };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        color: b.cor,
        background: b.fundo,
        border: `1px solid ${b.cor}`,
        whiteSpace: "nowrap",
      }}
    >
      {b.rotulo}
    </span>
  );
}
