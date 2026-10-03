/**
 * Componentes de UI compartilhados do app Campanha.
 *
 * Mesmo formato e tokens do app Contratos (`ui-contratos.tsx`) — Campo,
 * Vazio, CardKpi, BotaoIcone, FiltroPilulas, Linha. Acrescenta primitivas
 * próprias do domínio: BadgeStatus, BadgeTipo, BadgeEstado, PontoFase.
 */

import { Inbox, Pause, Play, type LucideIcon } from "lucide-react";

import {
  type EstadoLeadCampanha,
  type StatusCampanha,
  type TipoCampanha,
  badgeEstado,
  badgeStatus,
  badgeTipo,
} from "./tipos";

// ---------------------------------------------------------------------------
// Campo — label + filho
// ---------------------------------------------------------------------------

export function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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
      {hint && (
        <span style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.4)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Vazio — estado vazio padronizado (mesmo do Contratos)
// ---------------------------------------------------------------------------

export function Vazio({
  mensagem,
  pequeno,
  icone: Icone = Inbox,
}: {
  mensagem: string;
  pequeno?: boolean;
  icone?: LucideIcon;
}) {
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
      <Icone size={pequeno ? 16 : 32} style={{ opacity: 0.35 }} />
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
  sufixo,
}: {
  rotulo: string;
  valor: number | string;
  cor: string;
  sufixo?: string;
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
          fontSize: 28,
          fontWeight: 700,
          color: cor,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          lineHeight: 1.1,
          display: "flex",
          alignItems: "baseline",
          gap: 4,
        }}
      >
        <span>{valor}</span>
        {sufixo && (
          <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.6 }}>
            {sufixo}
          </span>
        )}
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
        color: desabilitado
          ? "oklch(0.98 0 0 / 0.2)"
          : perigo
          ? "oklch(0.65 0.24 25)"
          : "oklch(0.98 0 0 / 0.55)",
        cursor: desabilitado ? "not-allowed" : "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}

/** Botão com texto Pausar/Ativar — ícone sozinho passava despercebido. */
export function BotaoStatus({
  status,
  onClick,
}: {
  status: StatusCampanha;
  onClick: () => void;
}) {
  const ativa = status === "ativa";
  return (
    <button
      type="button"
      onClick={onClick}
      title={ativa ? "Pausar campanha" : "Ativar campanha"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 8,
        cursor: "pointer",
        color: ativa ? "oklch(0.82 0.16 80)" : "oklch(0.78 0.18 145)",
        background: ativa ? "oklch(0.78 0.18 80 / 0.12)" : "oklch(0.72 0.18 145 / 0.12)",
        border: `1px solid ${ativa ? "oklch(0.78 0.18 80 / 0.35)" : "oklch(0.72 0.18 145 / 0.35)"}`,
      }}
    >
      {ativa ? <Pause size={12} /> : <Play size={12} />}
      {ativa ? "Pausar" : "Ativar"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// FiltroPilulas — filtros em pílulas clicáveis (mesmo formato do Contratos)
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

// ---------------------------------------------------------------------------
// Badge — usa tokens do banco
// ---------------------------------------------------------------------------

function BadgeBase({
  rotulo,
  cor,
  fundo,
}: {
  rotulo: string;
  cor: string;
  fundo: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.3,
        color: cor,
        background: fundo,
        border: `1px solid ${cor.replace(")", " / 0.3)")}`,
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {rotulo}
    </span>
  );
}

export function BadgeStatus({ s }: { s: StatusCampanha }) {
  const b = badgeStatus(s);
  return <BadgeBase rotulo={b.rotulo} cor={b.cor} fundo={b.fundo} />;
}

export function BadgeTipo({ t }: { t: TipoCampanha }) {
  const b = badgeTipo(t);
  return (
    <BadgeBase
      rotulo={b.rotulo}
      cor={b.cor}
      fundo={b.cor.replace(")", " / 0.12)")}
    />
  );
}

export function BadgeEstado({ e }: { e: EstadoLeadCampanha }) {
  const b = badgeEstado(e);
  return <BadgeBase rotulo={b.rotulo} cor={b.cor} fundo={b.fundo} />;
}

// ---------------------------------------------------------------------------
// PontoFase — bolinha colorida pra indicar fase atual (mini-marcador)
// ---------------------------------------------------------------------------

export function PontoFase({ label, cor }: { label: string; cor: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: "oklch(0.98 0 0 / 0.75)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: cor,
          boxShadow: `0 0 0 3px ${cor.replace(")", " / 0.18)")}`,
        }}
      />
      {label}
    </span>
  );
}
