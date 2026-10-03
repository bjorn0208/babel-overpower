/**
 * Vitrine pública da rifa: capa em tela cheia, prêmio, progresso, promoções,
 * cotas premiadas, ranking e resultado do sorteio. CTA abre a compra.
 * Visual "Arena" (classes arp-*, arena-publica.css).
 */

import { BannerMidiaRifa } from "@/apps/user/rifas/componentes/banner-midia";
import type { DadosRifaPublica } from "./use-rifa-publica";
import { fmtBRL } from "./use-rifa-publica";

const ROTULO_SORTEIO_PUBLICO: Record<string, string> = {
  loteria_federal: "pela Loteria Federal (qua 20:00 · dom 11:00)",
  plataforma: "pelo sorteador da plataforma",
  ppt: "pela Loteria PPT (seg–sáb 09:20)",
  ptm: "pela Loteria PTM — Manhã (seg–sáb 11:20)",
  pt_rio: "pela Loteria PT — Rio (seg–sáb 14:20)",
  ptv: "pela Loteria PTV — Vespertino (seg–sáb 16:20)",
  ptn: "pela Loteria PTN — Noite (seg–sáb 18:20)",
  corujinha: "pela Loteria PT — Corujinha (seg–sáb 21:20)",
};

/** Nome curto pro chip; a frase completa vai no `title`. */
const ROTULO_SORTEIO_CURTO: Record<string, string> = {
  loteria_federal: "Loteria Federal",
  plataforma: "Plataforma",
  ppt: "PPT",
  ptm: "PTM",
  pt_rio: "PT Rio",
  ptv: "PTV",
  ptn: "PTN",
  corujinha: "Corujinha",
};

function Chip({ rotulo, valor, titulo }: { rotulo: string; valor: string; titulo?: string }) {
  return (
    <div className="arp-chip-num" title={titulo}>
      <span className="arp-chip-num__rotulo">{rotulo}</span>
      <span className="arp-chip-num__valor">{valor}</span>
    </div>
  );
}

export function VitrineRifa({
  dados,
  temPedido,
  onComprar,
  onVerPedido,
}: {
  dados: DadosRifaPublica;
  temPedido: boolean;
  onComprar: () => void;
  onVerPedido: () => void;
}) {
  const r = dados.rifa;
  const prog = dados.progresso;
  const pct = Math.min(100, Math.round((prog.pagos / r.total_numeros) * 100));
  const encerrada = r.status !== "ativa";
  const temMidia = Boolean(r.imagem_url || (r.galeria_urls ?? []).length > 0);
  const rotuloSorteio = ROTULO_SORTEIO_PUBLICO[r.metodo_sorteio] ?? "pelo sorteador da plataforma";
  const dataSorteio = r.data_sorteio_prevista
    ? new Date(r.data_sorteio_prevista + "T12:00:00").toLocaleDateString("pt-BR")
    : "a definir";

  return (
    <div>
      {/* Capa: capa + galeria (foto e vídeo) girando juntas, degradê pro fundo
          e, sobre ele, selo + título + descrição. */}
      <section className={`arp-capa${temMidia ? "" : " arp-capa--sem-midia"}`}>
        {temMidia && (
          <BannerMidiaRifa
            capa={r.imagem_url}
            galeria={r.galeria_urls}
            titulo={r.premio_principal}
            comoFundo
          />
        )}
        <div className="arp-capa__veu" />
        <div className="arp-capa__texto">
          {dados.resultado ? (
            <span className="arp-selo arp-selo--info">Sorteada</span>
          ) : encerrada ? (
            <span className="arp-selo arp-selo--aviso">Vendas pausadas</span>
          ) : (
            <span className="arp-selo arp-selo--ok">Vendas abertas</span>
          )}

          <h1 className="arp-capa__titulo arp-titulo-misto">
            {r.titulo} <em>{r.premio_principal}</em>
          </h1>

          {r.descricao && <p className="arp-capa__desc">{r.descricao}</p>}
        </div>
      </section>

      <div className="arp-conteudo">
        {/* chips de número */}
        <div className="arp-chips">
          <Chip rotulo="Por número" valor={fmtBRL(r.preco_numero_centavos)} />
          <Chip rotulo="Vendidos" valor={`${pct}%`} />
          <Chip rotulo="Sorteio" valor={dataSorteio} />
          <Chip
            rotulo="Método"
            valor={ROTULO_SORTEIO_CURTO[r.metodo_sorteio] ?? "Plataforma"}
            titulo={`Sorteio ${rotuloSorteio}`}
          />
        </div>

        {/* progresso */}
        <div className="arp-secao">
          <div className="flex items-baseline justify-between gap-3">
            <span className="arp-rotulo arp-rotulo--linha">
              {prog.pagos.toLocaleString("pt-BR")} de {r.total_numeros.toLocaleString("pt-BR")}{" "}
              vendidos
            </span>
            <span className="arp-lista__meta">
              {prog.disponiveis.toLocaleString("pt-BR")} livres
            </span>
          </div>
          <div className="arp-progresso">
            <div className="arp-progresso__fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* resultado do sorteio */}
        {dados.resultado && (
          <div className="arp-secao arp-cartao arp-cartao--ok">
            <div className="arp-rotulo">Número sorteado</div>
            <div className="arp-pix__valor">{dados.resultado.numero_sorteado}</div>
            <div className="mt-2" style={{ fontSize: "var(--ar-t-sm)" }}>
              {dados.resultado.ganhador_nome
                ? `Ganhador: ${dados.resultado.ganhador_nome}`
                : "Número não vendido — aguarde novo sorteio."}
            </div>
          </div>
        )}

        {/* promoções */}
        {r.promocoes.length > 0 && !dados.resultado && (
          <div className="arp-secao">
            <span className="arp-rotulo">Leve mais, pague menos</span>
            <div className="grid grid-cols-2 gap-2">
              {r.promocoes.map((p, i) => (
                <div key={i} className="arp-cartao arp-cartao--compacto arp-cartao--rosa">
                  <div className="arp-chip-num__valor" style={{ fontSize: "var(--ar-t-lg)" }}>
                    {p.qtd}
                  </div>
                  <div className="arp-chip-num__rotulo">
                    número{p.qtd === 1 ? "" : "s"} por {fmtBRL(p.preco_total_centavos)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* cotas premiadas */}
        {dados.cotas_premiadas.length > 0 && (
          <div className="arp-secao">
            <span className="arp-rotulo">Números da sorte — prêmio na hora</span>
            <div className="grid gap-2">
              {dados.cotas_premiadas.map((c, i) => (
                <div
                  key={i}
                  className={`arp-chip-premio${c.ganho ? " arp-chip-premio--ganho" : ""}`}
                >
                  <span className="arp-chip-premio__num">Nº {c.numero}</span>
                  <span className="truncate">
                    {c.premio}
                    {c.ganho && c.ganhador_nome ? ` — ${c.ganhador_nome}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ranking */}
        {dados.ranking.length > 0 && (
          <div className="arp-secao">
            <span className="arp-rotulo">Maiores compradores</span>
            <div className="arp-lista">
              {dados.ranking.map((p, i) => (
                <div key={i} className="arp-lista__item">
                  <span className="arp-lista__pos">{i + 1}º</span>
                  <div className="arp-lista__corpo">
                    <div className="arp-lista__nome">{p.nome}</div>
                    <div className="arp-lista__meta">{p.phone_mascarado}</div>
                  </div>
                  <span className="arp-lista__valor">{p.qtd}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {temPedido && (
          <button
            className="arp-btn arp-btn--secundario arp-btn--bloco"
            type="button"
            onClick={onVerPedido}
            style={{ marginTop: "var(--ar-s-6)" }}
          >
            Ver meu pedido
          </button>
        )}

        {!encerrada && (
          <div className="arp-cta">
            <button
              className="arp-btn arp-btn--primario arp-btn--bloco arp-btn--grande"
              type="button"
              onClick={onComprar}
            >
              Comprar números
            </button>
          </div>
        )}

        {encerrada && !dados.resultado && (
          <div
            className="arp-secao"
            style={{ textAlign: "center", fontSize: "var(--ar-t-sm)", color: "var(--ar-txt-3)" }}
          >
            Vendas pausadas no momento.
          </div>
        )}
      </div>
    </div>
  );
}
