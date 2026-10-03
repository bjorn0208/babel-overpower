/** Aba Resultados — próximos sorteios (ativas com data) e sorteios realizados. Visual Arena. */

import { useMemo, useState } from "react";
import { CarregandoCentro, EstadoVazio } from "../componentes/basicos";
import { Modal } from "../componentes/modal";
import { contagemSorteio, fmtData, fmtDataHora, ROTULO_METODO_SORTEIO } from "../formato";
import type { Rifa } from "../tipos";

export interface AbaResultadosProps {
  rifas: Rifa[];
  carregando: boolean;
  aoAbrir: (rifa: Rifa) => void;
}

export const AbaResultados = ({ rifas, carregando, aoAbrir }: AbaResultadosProps) => {
  const [ata, setAta] = useState<Rifa | null>(null);

  const proximas = useMemo(
    () =>
      rifas
        .filter((r) => r.status === "ativa" && r.data_sorteio_prevista)
        .sort((a, b) => (a.data_sorteio_prevista ?? "").localeCompare(b.data_sorteio_prevista ?? "")),
    [rifas],
  );

  const sorteadas = useMemo(
    () =>
      rifas
        .filter((r) => r.status === "sorteada")
        .sort((a, b) => (b.sorteada_em ?? "").localeCompare(a.sorteada_em ?? "")),
    [rifas],
  );

  if (carregando) return <CarregandoCentro rotulo="Carregando resultados…" />;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="ar-titulo-secao">Resultados e sorteios</h2>
        <p className="text-sm ar-txt-3 mt-1">Próximos sorteios e os já realizados, com número e ganhador.</p>
      </div>

      {/* Próximos: chips de data roláveis, como a faixa "21 Feb · Today · 23 Feb" */}
      {proximas.length > 0 && (
        <section>
          <p className="ar-rotulo mb-3">Próximos sorteios</p>
          <div className="ar-scroll-x -mx-4 px-4">
            {proximas.map((r) => {
              const contagem = contagemSorteio(r.metodo_sorteio, r.data_sorteio_prevista);
              const hoje = contagem === "hoje";
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => aoAbrir(r)}
                  className={`ar-cartao ar-cartao--compacto ar-cartao--clicavel text-left w-[240px] ${hoje ? "ar-cartao--roxo" : ""}`}
                >
                  <p className="ar-rotulo" style={hoje ? { color: "rgba(255,255,255,0.7)" } : undefined}>
                    {hoje ? "é hoje!" : `em ${contagem}`}
                  </p>
                  <p className="font-medium mt-1 truncate" style={{ color: hoje ? "#fff" : "var(--ar-txt-1)" }}>{r.titulo}</p>
                  <p className="text-xs mt-1 truncate" style={{ color: hoje ? "rgba(255,255,255,0.7)" : "var(--ar-txt-3)" }}>
                    {fmtData(r.data_sorteio_prevista)} · {ROTULO_METODO_SORTEIO[r.metodo_sorteio]}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Realizados */}
      <section>
        <p className="ar-rotulo mb-3">Sorteios realizados</p>

        {sorteadas.length === 0 ? (
          <EstadoVazio
            icone={<span aria-hidden>🎯</span>}
            titulo="Nenhum sorteio realizado ainda"
            descricao="Quando você sortear uma rifa, o resultado com número e ganhador aparece aqui."
          />
        ) : (
          <div className="space-y-3">
            {sorteadas.map((r) => {
              const cotasGanhas = (r.cotas_premiadas ?? []).filter((c) => c.pedido_ganhador);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setAta(r)}
                  className="ar-cartao ar-cartao--compacto ar-cartao--clicavel w-full text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="ar-placar shrink-0">
                      <span className="ar-placar__num">#{r.numero_sorteado}</span>
                      <span className="ar-placar__sub">sorteado</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium ar-txt-1 truncate">{r.titulo}</p>
                      <p className="text-xs ar-txt-3 mt-0.5">{fmtDataHora(r.sorteada_em)}</p>
                      <p className="text-sm mt-1 truncate" style={{ color: r.ganhador_nome ? "var(--ar-ok)" : "var(--ar-txt-3)" }}>
                        {r.ganhador_nome ? `🏆 ${r.ganhador_nome}` : "número sem dono — sem ganhador"}
                      </p>
                    </div>
                    <span className="text-xs ar-txt-4 shrink-0">Ata ›</span>
                  </div>
                  {cotasGanhas.length > 0 && (
                    <div className="ar-scroll-x mt-3">
                      {cotasGanhas.map((c) => (
                        <span key={c.numero} className="ar-chip-num">
                          <span className="ar-chip-num__rotulo">🎁 nº {c.numero}</span>
                          <span className="ar-chip-num__valor" style={{ fontFamily: "inherit" }}>{c.ganhador_nome}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Ata */}
      <Modal aberto={!!ata} aoFechar={() => setAta(null)} titulo="Ata do sorteio" tamanho="lg">
        {ata && (
          <div className="space-y-4">
            <div className="ar-cartao ar-cartao--alto ar-cartao--compacto text-sm space-y-1">
              <p><span className="ar-txt-3">Rifa:</span> <span className="ar-txt-1">{ata.titulo}</span></p>
              <p><span className="ar-txt-3">Realizado em:</span> <span className="ar-txt-1">{fmtDataHora(ata.sorteada_em)}</span></p>
              <p><span className="ar-txt-3">Método:</span> <span className="ar-txt-1">{ROTULO_METODO_SORTEIO[ata.metodo_sorteio]}</span></p>
            </div>

            <div className="ar-cartao ar-cartao--roxo ar-cartao--compacto flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl" aria-hidden>🥇</span>
                <div className="min-w-0">
                  <p className="font-medium truncate">{ata.ganhador_nome || "Número sem dono — sem ganhador"}</p>
                  {ata.ganhador_phone && <p className="text-xs ar-num" style={{ color: "rgba(255,255,255,0.7)" }}>{ata.ganhador_phone}</p>}
                </div>
              </div>
              <span className="ar-valor shrink-0" style={{ color: "#fff" }}>#{ata.numero_sorteado}</span>
            </div>

            {(ata.cotas_premiadas ?? []).filter((c) => c.pedido_ganhador).length > 0 && (
              <div>
                <p className="ar-rotulo mb-2">Cotas premiadas que saíram</p>
                <div className="ar-lista">
                  {(ata.cotas_premiadas ?? [])
                    .filter((c) => c.pedido_ganhador)
                    .map((c) => (
                      <div key={c.numero} className="ar-linha text-sm">
                        <span className="ar-num ar-txt-1 font-bold">nº {c.numero}</span>
                        <span className="ar-txt-3 flex-1 truncate">{c.premio}</span>
                        <span className="font-medium" style={{ color: "var(--ar-ok)" }}>{c.ganhador_nome}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
