import { Share2, Ticket, Trophy } from "lucide-react";
import { fmtBRL, fmtData, fmtNumero } from "../formato";
import type { Rifa, StatsRifa } from "../tipos";
import { BarraProgresso, seloDoStatus } from "./basicos";

export interface CartaoRifaProps {
  rifa: Rifa;
  stats: StatsRifa;
  aoAbrir: (rifa: Rifa) => void;
  aoCompartilhar?: (rifa: Rifa) => void;
  destaque?: boolean;
}

/**
 * Cartão de rifa — "card de evento" da referência Arena: capa pequena à esquerda,
 * placar `vendidos : total` no centro e chips de número embaixo (preço, arrecadado, faltam).
 * Fundo por estado: roxo = destaque, rosa = pendência (reservas esperando), chumbo = demais.
 */
export const CartaoRifa = ({ rifa, stats, aoAbrir, aoCompartilhar, destaque = false }: CartaoRifaProps) => {
  const selo = seloDoStatus(rifa.status);
  const faltam = Math.max(0, rifa.total_numeros - stats.vendidos);
  const pct = (stats.vendidos / Math.max(1, rifa.total_numeros)) * 100;
  const pendencia = !destaque && stats.reservados > 0 && rifa.status === "ativa";
  const colorido = destaque || pendencia;
  const tom = destaque ? "ar-cartao--roxo" : pendencia ? "ar-cartao--rosa" : "";
  const ativa = rifa.status === "ativa";

  return (
    <div
      className={`ar-cartao ar-cartao--clicavel ar-rifa-cartao ${tom} ${destaque ? "ar-destaque" : ""} group`}
      onClick={() => aoAbrir(rifa)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          aoAbrir(rifa);
        }
      }}
    >
      {/* Topo: capa + título + status (e, a partir de 640px, o placar ao lado) */}
      <div className="ar-rifa-linha">
      <div className="ar-rifa-topo flex-1 min-w-0">
        <div className="ar-capa">
          {rifa.imagem_url ? <img src={rifa.imagem_url} alt="" loading="lazy" /> : <Ticket size={26} aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[var(--ar-t-md)] font-medium leading-tight line-clamp-2" style={{ color: colorido ? "#fff" : "var(--ar-txt-1)" }}>
            {rifa.titulo}
          </h3>
          <p
            className="text-sm mt-0.5 truncate flex items-center gap-1.5"
            style={{ color: colorido ? "rgba(255,255,255,0.75)" : "var(--ar-txt-3)" }}
          >
            <Trophy size={13} className="shrink-0" aria-hidden /> {rifa.premio_principal}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-[0.08em] uppercase"
              style={{ color: colorido ? "#fff" : ativa ? "var(--ar-ok)" : "var(--ar-txt-3)" }}
            >
              {ativa && <span className="w-1.5 h-1.5 rounded-full" style={{ background: colorido ? "var(--ar-ok)" : "currentColor" }} />}
              {selo.rotulo}
            </span>
            {rifa.codigo_controle && (
              <span className="ar-num text-[11px]" style={{ color: colorido ? "rgba(255,255,255,0.6)" : "var(--ar-txt-4)" }}>
                {rifa.codigo_controle}
              </span>
            )}
          </div>
        </div>
        {aoCompartilhar && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              aoCompartilhar(rifa);
            }}
            aria-label="Compartilhar"
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors"
            style={{ background: colorido ? "rgba(255,255,255,0.16)" : "var(--ar-cartao-alto)", color: colorido ? "#fff" : "var(--ar-txt-2)" }}
          >
            <Share2 size={16} />
          </button>
        )}
      </div>

      {/* Placar: vendidos : total, como o placar do jogo na referência */}
      <div className="ar-rifa-placar-area">
        <div className="ar-placar">
          <span className="ar-placar__num">
            {fmtNumero(stats.vendidos)}<span style={{ opacity: 0.5 }}> : </span>{fmtNumero(rifa.total_numeros)}
          </span>
          <span className="ar-placar__sub">{pct.toFixed(0)}% vendidos · sorteio {fmtData(rifa.data_sorteio_prevista)}</span>
        </div>
      </div>
      </div>

      <div className="mt-4">
        <BarraProgresso valor={stats.vendidos} maximo={rifa.total_numeros} />
      </div>

      {/* Chips de número (as "odds" da referência) */}
      <div className="ar-rifa-chips">
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">nº</span>
          <span className="ar-chip-num__valor">{fmtBRL(rifa.preco_numero_centavos)}</span>
        </span>
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">caixa</span>
          <span className="ar-chip-num__valor">{fmtBRL(stats.arrecadadoCentavos)}</span>
        </span>
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">faltam</span>
          <span className="ar-chip-num__valor">{fmtNumero(faltam)}</span>
        </span>
        {stats.reservados > 0 && (
          <span className="ar-chip-num">
            <span className="ar-chip-num__rotulo">reserva</span>
            <span className="ar-chip-num__valor">{fmtNumero(stats.reservados)}</span>
          </span>
        )}
      </div>
    </div>
  );
};
