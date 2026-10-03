/** Componentes visuais pequenos do app Rifas (Arena): selo, barra, carregando, vazio, métrica. */

import type React from "react";

// ── Selo (badge de status) ──────────────────────────────────────────────

export type VarianteSelo = "sucesso" | "alerta" | "perigo" | "info" | "neutro";

const CORES_SELO: Record<VarianteSelo, { fundo: string; tinta: string }> = {
  sucesso: { fundo: "var(--ar-ok-vidro)", tinta: "var(--ar-ok)" },
  alerta: { fundo: "var(--ar-aviso-vidro)", tinta: "var(--ar-aviso)" },
  perigo: { fundo: "var(--ar-erro-vidro)", tinta: "var(--ar-erro)" },
  info: { fundo: "var(--ar-info-vidro)", tinta: "var(--ar-info)" },
  neutro: { fundo: "var(--ar-filete)", tinta: "var(--ar-txt-3)" },
};

export const Selo = ({
  children,
  variante = "neutro",
  ponto = false,
  className = "",
}: {
  children: React.ReactNode;
  variante?: VarianteSelo;
  ponto?: boolean;
  className?: string;
}) => {
  const cor = CORES_SELO[variante];
  return (
    <span
      className={`ar-selo inline-flex items-center gap-1.5 rounded-full font-medium px-2.5 py-1 text-xs whitespace-nowrap ${className}`}
      style={{ background: cor.fundo, color: cor.tinta }}
    >
      {ponto && <span className="w-1.5 h-1.5 rounded-full" style={{ background: cor.tinta }} />}
      {children}
    </span>
  );
};

/** Selo pronto pra status de rifa e de pedido (rótulos do banco real). */
export const seloDoStatus = (status: string): { rotulo: string; variante: VarianteSelo } => {
  const mapa: Record<string, { rotulo: string; variante: VarianteSelo }> = {
    rascunho: { rotulo: "Rascunho", variante: "neutro" },
    ativa: { rotulo: "Ativa", variante: "sucesso" },
    pausada: { rotulo: "Pausada", variante: "alerta" },
    encerrada: { rotulo: "Encerrada", variante: "info" },
    sorteada: { rotulo: "Sorteada", variante: "info" },
    reservado: { rotulo: "Reservado", variante: "alerta" },
    aguardando_validacao: { rotulo: "Aguardando validação", variante: "alerta" },
    pago: { rotulo: "Pago", variante: "sucesso" },
    expirado: { rotulo: "Expirado", variante: "neutro" },
    cancelado: { rotulo: "Cancelado", variante: "neutro" },
    rejeitado: { rotulo: "Rejeitado", variante: "perigo" },
  };
  return mapa[status] || { rotulo: status, variante: "neutro" };
};

// ── Barra de progresso ──────────────────────────────────────────────────

export const BarraProgresso = ({
  valor,
  maximo = 100,
  altura = "h-1.5",
}: {
  valor: number;
  maximo?: number;
  altura?: string;
}) => {
  const pct = Math.min(100, Math.max(0, (valor / Math.max(1, maximo)) * 100));
  return (
    <div className={`w-full ${altura} rounded-full overflow-hidden`} style={{ background: "rgba(255,255,255,0.12)" }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--ar-roxo-alto), var(--ar-rosa))" }}
      />
    </div>
  );
};

// ── Carregando (spinner) ────────────────────────────────────────────────

export const Carregando = ({ rotulo, className = "" }: { rotulo?: string; className?: string }) => (
  <div
    className={`inline-flex flex-col items-center gap-3 ${className}`}
    role="status"
    aria-label={rotulo || "Carregando"}
  >
    <div
      className="w-9 h-9 rounded-full border-[3px] border-transparent animate-spin"
      style={{ borderTopColor: "var(--ar-roxo)", borderRightColor: "var(--ar-roxo)" }}
    />
    {rotulo && <span className="text-sm ar-txt-3 font-medium">{rotulo}</span>}
  </div>
);

export const CarregandoCentro = ({ rotulo = "Carregando…" }: { rotulo?: string }) => (
  <div className="flex items-center justify-center py-16">
    <Carregando rotulo={rotulo} />
  </div>
);

// ── Estado vazio ────────────────────────────────────────────────────────

export const EstadoVazio = ({
  icone,
  titulo,
  descricao,
  acao,
}: {
  icone?: React.ReactNode;
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
}) => (
  <div className="ar-vazio">
    {icone && <div className="ar-vazio__icone">{icone}</div>}
    <h3 className="ar-titulo-secao">{titulo}</h3>
    {descricao && <p className="text-base ar-txt-3 mt-2 max-w-md">{descricao}</p>}
    {acao && <div className="mt-6">{acao}</div>}
  </div>
);

// ── Cartão de métrica ───────────────────────────────────────────────────

const FUNDO_ICONE: Record<string, { fundo: string; tinta: string }> = {
  trevo: { fundo: "var(--ar-roxo-vidro)", tinta: "var(--ar-roxo-alto)" },
  emerald: { fundo: "var(--ar-ok-vidro)", tinta: "var(--ar-ok)" },
  blue: { fundo: "var(--ar-info-vidro)", tinta: "var(--ar-info)" },
  amber: { fundo: "var(--ar-aviso-vidro)", tinta: "var(--ar-aviso)" },
  gray: { fundo: "var(--ar-filete)", tinta: "var(--ar-txt-2)" },
};

export const CartaoMetrica = ({
  rotulo,
  valor,
  sub,
  icone,
  cor = "gray",
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  icone?: React.ReactNode;
  cor?: "trevo" | "emerald" | "blue" | "amber" | "gray";
}) => {
  const c = FUNDO_ICONE[cor];
  return (
    <div className="ar-cartao">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ar-rotulo truncate">{rotulo}</p>
          <p className="ar-valor mt-2 truncate">{valor}</p>
          {sub && <p className="text-sm ar-txt-3 mt-1">{sub}</p>}
        </div>
        {icone && (
          <div
            className="w-11 h-11 rounded-[var(--ar-r-md)] flex items-center justify-center shrink-0 text-xl"
            style={{ background: c.fundo, color: c.tinta }}
          >
            {icone}
          </div>
        )}
      </div>
    </div>
  );
};
