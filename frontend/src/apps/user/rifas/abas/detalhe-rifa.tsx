/**
 * Detalhe da rifa (visão do dono): hero com capa/galeria, progresso real via
 * `obter_rifa_por_token`, ranking, cotas, últimas compras e ações —
 * ativar/pausar, vender números, link público, editar, excluir e sorteio.
 * Visual Arena (skill design-rifas, 2026-09-12): placar grande, métricas em grid,
 * ações principais numa barra fixa no pé (alcance do polegar no celular).
 */

import { ArrowLeft, Link2, Pause, Pencil, Play, Share2, Sparkles, Ticket, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BannerMidiaRifa } from "../componentes/banner-midia";
import { BarraProgresso, CartaoMetrica, Selo, seloDoStatus } from "../componentes/basicos";
import { Botao } from "../componentes/botao";
import { Campo } from "../componentes/campo";
import { excluirRifa, mudarStatusRifa, obterDetalhe, sortear } from "../dados-rifas";
import { ModalConfirmar } from "../componentes/modal-confirmar";
import { CartoesDetalhe } from "./detalhe-cards";
import { urlRifa } from "@/lib/url-app";
import { contagemSorteio, ehVideo, fmtBRL, fmtData, fmtNumero, ROTULO_METODO_SORTEIO } from "../formato";
import type { DetalheRifa, Rifa, StatsRifa } from "../tipos";
import "./detalhe-rifa.css";

/** O que o modal de confirmação precisa saber pra perguntar e executar. */
type PedidoConfirmacao = {
  titulo: string;
  mensagem: string;
  textoConfirmar: string;
  variante: "primario" | "perigo" | "sucesso";
  acao: () => Promise<void>;
};

export interface DetalheRifaProps {
  rifa: Rifa;
  stats: StatsRifa;
  aoVoltar: () => void;
  aoVenderNumeros: (rifa: Rifa, detalhe: DetalheRifa | null) => void;
  aoEditar: (rifa: Rifa) => void;
  aoCompartilhar: (rifa: Rifa) => void;
  aoMudou: () => void;
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

export const PainelDetalheRifa = ({
  rifa,
  stats,
  aoVoltar,
  aoVenderNumeros,
  aoEditar,
  aoCompartilhar,
  aoMudou,
  aoNotificar,
}: DetalheRifaProps) => {
  const [detalhe, setDetalhe] = useState<DetalheRifa | null>(null);
  // Um campo por prêmio (1º, 2º, 3º...) — registra todos os vencedores de
  // uma vez (Dominic 26/08). Rifa sem prêmios extras = campo único.
  const [numerosManuais, setNumerosManuais] = useState<string[]>([]);
  const [agindo, setAgindo] = useState(false);
  const [confirmacao, setConfirmacao] = useState<PedidoConfirmacao | null>(null);

  const carregarDetalhe = useCallback(async () => {
    setDetalhe(await obterDetalhe(rifa.chave_publica));
  }, [rifa.chave_publica]);

  useEffect(() => {
    void carregarDetalhe();
  }, [carregarDetalhe]);

  const mudarStatus = async (status: Rifa["status"]) => {
    setAgindo(true);
    try {
      await mudarStatusRifa(rifa.id, status);
      aoNotificar(`Rifa ${seloDoStatus(status).rotulo.toLowerCase()}.`, "success");
      aoMudou();
    } catch (e) {
      aoNotificar(`Falha: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setAgindo(false);
    }
  };

  // Confirmação pelo modal do app, não pelo `window.confirm` do navegador (Δ 2026-09-08).
  const excluir = () => {
    setConfirmacao({
      titulo: "Excluir esta rifa?",
      mensagem: `A rifa "${rifa.titulo}" sai da lista junto com o que já foi vendido nela. Se é só pra parar de vender, o certo é pausar.`,
      textoConfirmar: "Excluir",
      variante: "perigo",
      acao: async () => {
        await excluirRifa(rifa.id);
        aoNotificar("Rifa excluída.", "success");
        aoMudou();
        aoVoltar();
      },
    });
  };

  const sortearAgora = async (manual: boolean) => {
    // Com prêmios extras, o resultado manual é uma LISTA: um número por
    // prêmio, separados por vírgula ("12, 45, 78").
    const qtdPremios = 1 + (rifa.premios_extras?.length ?? 0);
    const nums = manual
      ? numerosManuais.map((x) => Number.parseInt(x, 10)).filter((x) => Number.isFinite(x))
      : [];
    const num = manual ? nums[0] ?? null : null;
    if (manual && nums.length === 0) {
      aoNotificar("Informe o número sorteado.", "error");
      return;
    }
    if (manual && qtdPremios > 1 && nums.length !== qtdPremios) {
      aoNotificar(`Esta rifa tem ${qtdPremios} prêmios — informe ${qtdPremios} números separados por vírgula.`, "error");
      return;
    }
    setConfirmacao({
      titulo: manual ? "Registrar este resultado?" : "Sortear agora?",
      mensagem: manual
        ? `${nums.length > 1 ? `Os números ${nums.join(", ")} viram` : `O número ${num} vira`} o resultado oficial desta rifa. Depois de registrado, a rifa fecha.`
        : "Vou sortear um número aleatório entre os que já foram PAGOS. O resultado é oficial e fecha a rifa.",
      textoConfirmar: manual ? "Registrar" : "Sortear",
      variante: "primario",
      acao: async () => {
        const r = await sortear(rifa.id, num, nums);
        if (!r.ok) {
          aoNotificar(`Sorteio recusado: ${r.erro ?? "?"}`, "error");
          return;
        }
        aoNotificar(
          r.semGanhador
            ? `Número ${r.numeroSorteado} registrado — ninguém comprou esse número.`
            : `🎉 Número ${r.numeroSorteado} · ganhador: ${r.ganhadorNome}`,
          "success",
        );
        aoMudou();
        void carregarDetalhe();
      },
    });
  };

  const confirmar = async () => {
    if (!confirmacao) return;
    setAgindo(true);
    try {
      await confirmacao.acao();
      setConfirmacao(null);
    } catch (e) {
      aoNotificar(`Falha: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setAgindo(false);
    }
  };

  const copiarLink = () => {
    const url = urlRifa(rifa.chave_publica);
    navigator.clipboard?.writeText(url);
    aoNotificar(`Link copiado: ${url}`, "success");
  };

  const selo = seloDoStatus(rifa.status);
  const progresso = detalhe?.progresso;
  const pagos = progresso ? progresso.pagos : stats.vendidos;
  const pct = (pagos / Math.max(1, rifa.total_numeros)) * 100;
  const contagem = contagemSorteio(rifa.metodo_sorteio, rifa.data_sorteio_prevista);
  const vendavel = rifa.status === "ativa";
  const temMidia = !!rifa.imagem_url || (rifa.galeria_urls ?? []).length > 0;
  const qtdPremios = 1 + (rifa.premios_extras?.length ?? 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Topo: voltar + título curto */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={aoVoltar} className="ar-icone-btn" aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="ar-rotulo">A rifa</p>
          <h1 className="text-[var(--ar-t-md)] font-medium ar-txt-1 truncate">{rifa.titulo}</h1>
        </div>
      </div>

      {/* Hero */}
      <div className={`ar-hero ${temMidia ? "" : "ar-hero--sem-midia"}`}>
        <BannerMidiaRifa capa={rifa.imagem_url} galeria={rifa.galeria_urls} titulo={rifa.titulo} comoFundo />
        <div className="ar-hero__veu" />
        <div className="ar-hero__conteudo">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Selo variante={selo.variante} ponto>
              {selo.rotulo}
            </Selo>
            <span className="text-[10px] font-medium tracking-[0.08em] uppercase px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }}>
              {ROTULO_METODO_SORTEIO[rifa.metodo_sorteio]}
            </span>
          </div>
          <h2 className="ar-titulo-misto text-[var(--ar-t-2xl)] font-bold leading-tight" style={{ color: "#fff" }}>
            {rifa.titulo} <em>{rifa.premio_principal}</em>
          </h2>
          {rifa.codigo_controle && <p className="ar-num text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{rifa.codigo_controle}</p>}
          <div className="ar-scroll-x mt-4 -mx-1 px-1">
            <span className="ar-chip-num" style={{ background: "rgba(255,255,255,0.14)" }}>
              <span className="ar-chip-num__rotulo" style={{ color: "rgba(255,255,255,0.7)" }}>nº</span>
              <span className="ar-chip-num__valor">{fmtBRL(rifa.preco_numero_centavos)}</span>
            </span>
            <span className="ar-chip-num" style={{ background: "rgba(255,255,255,0.14)" }}>
              <span className="ar-chip-num__rotulo" style={{ color: "rgba(255,255,255,0.7)" }}>caixa</span>
              <span className="ar-chip-num__valor">{fmtBRL(stats.arrecadadoCentavos)}</span>
            </span>
            {contagem && (
              <span className="ar-chip-num" style={{ background: "rgba(255,255,255,0.14)" }}>
                <span className="ar-chip-num__rotulo" style={{ color: "rgba(255,255,255,0.7)" }}>sorteio</span>
                <span className="ar-chip-num__valor">{contagem === "hoje" ? "hoje" : `em ${contagem}`}</span>
              </span>
            )}
          </div>
          {(rifa.galeria_urls ?? []).length > 0 && (
            <div className="flex gap-2 mt-4 flex-wrap">
              {rifa.galeria_urls.map((g, i) => (
                <a key={g} href={g} target="_blank" rel="noreferrer">
                  {ehVideo(g) ? (
                    <video src={g} className="ar-hero__miniatura" muted />
                  ) : (
                    <img src={g} alt={`item ${i + 1} do prêmio`} className="ar-hero__miniatura" />
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Placar + progresso */}
      <div className="ar-cartao">
        <div className="flex items-center justify-center gap-4">
          <p className="ar-rotulo text-center">Pagos</p>
          <div className="ar-placar">
            <span className="ar-placar__num">
              {fmtNumero(pagos)}<span style={{ opacity: 0.5 }}> : </span>{fmtNumero(rifa.total_numeros)}
            </span>
            <span className="ar-placar__sub">{pct.toFixed(1)}% · sorteio {fmtData(rifa.data_sorteio_prevista)}</span>
          </div>
          <p className="ar-rotulo text-center">Total</p>
        </div>
        <div className="mt-4">
          <BarraProgresso valor={pagos} maximo={rifa.total_numeros} />
        </div>
        <p className="text-xs ar-txt-3 text-center mt-3">
          {progresso ? `${fmtNumero(progresso.reservados)} reservados · ${fmtNumero(progresso.disponiveis)} disponíveis` : "…"}
        </p>
      </div>

      {/* Métricas */}
      <div className="ar-grid-metricas">
        <CartaoMetrica rotulo="Arrecadado" valor={fmtBRL(stats.arrecadadoCentavos)} cor="trevo" icone="💵" />
        <CartaoMetrica rotulo="Participantes" valor={fmtNumero(stats.participantes)} cor="blue" icone="👥" />
        <CartaoMetrica rotulo="Reservados" valor={fmtNumero(progresso ? progresso.reservados : stats.reservados)} cor="amber" icone="⏳" />
        <CartaoMetrica rotulo="Disponíveis" valor={fmtNumero(progresso ? progresso.disponiveis : Math.max(0, rifa.total_numeros - stats.vendidos - stats.reservados))} cor="gray" icone="🎟️" />
      </div>

      {/* Ações secundárias do dono */}
      <div className="flex flex-wrap gap-2">
        {(rifa.status === "rascunho" || rifa.status === "pausada") && (
          <Botao tamanho="sm" variante="sucesso" disabled={agindo} onClick={() => void mudarStatus("ativa")}>
            <Play size={16} /> Ativar
          </Botao>
        )}
        {rifa.status === "ativa" && (
          <Botao tamanho="sm" variante="secundario" disabled={agindo} onClick={() => void mudarStatus("pausada")}>
            <Pause size={16} /> Pausar
          </Botao>
        )}
        <Botao tamanho="sm" variante="secundario" onClick={copiarLink}>
          <Link2 size={16} /> Copiar link
        </Botao>
        <Botao tamanho="sm" variante="contorno" onClick={() => aoEditar(rifa)}>
          <Pencil size={16} /> Editar
        </Botao>
        <Botao tamanho="sm" variante="fantasma" disabled={agindo} onClick={() => excluir()} style={{ color: "var(--ar-erro)" }}>
          <Trash2 size={16} /> Excluir
        </Botao>
      </div>

      {/* Resultado */}
      {rifa.status === "sorteada" && (
        <div className="ar-ok-box">
          <p className="font-bold text-[var(--ar-t-md)]">🎉 Número sorteado: <span className="ar-num">{rifa.numero_sorteado}</span></p>
          <p className="text-sm mt-1" style={{ color: "var(--ar-txt-2)" }}>
            {rifa.ganhador_nome ? `Ganhador: ${rifa.ganhador_nome} · ${rifa.ganhador_phone ?? ""}` : "Número não vendido — sem ganhador."}
          </p>
        </div>
      )}

      {/* Cotas / ranking / últimas compras */}
      <CartoesDetalhe detalhe={detalhe} />

      {/* Sorteio — só faz sentido numa rifa que já pode sortear: ativa (vendendo)
          ou encerrada (venda fechada). Rascunho/pausada/sorteada não mostram. */}
      {(rifa.status === "ativa" || rifa.status === "encerrada") && (
        <div className="ar-cartao">
          <h3 className="ar-titulo-secao text-[var(--ar-t-md)] mb-1">🎲 Sorteio</h3>
          <p className="text-sm ar-txt-3 mb-4">
            Pela plataforma (aleatório entre os pagos) ou registrando o resultado da Loteria Federal.
          </p>
          <Botao disabled={agindo} onClick={() => sortearAgora(false)} larguraTotal className="sm:w-auto">
            <Sparkles size={16} /> Sortear pela plataforma
          </Botao>
          <div className="ar-divisor" />
          <p className="ar-rotulo mb-3">Ou registrar o resultado</p>
          <div className="flex flex-wrap items-end gap-2">
            {Array.from({ length: qtdPremios }, (_, i) => (
              <div key={i} className="ar-campo-sorteio">
                <Campo
                  rotulo={`${i + 1}º prêmio${i > 0 && rifa.premios_extras?.[i - 1] ? ` · ${rifa.premios_extras[i - 1].slice(0, 14)}` : ""}`}
                  placeholder="Nº sorteado"
                  inputMode="numeric"
                  value={numerosManuais[i] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setNumerosManuais((l) => {
                      const novo = [...l];
                      novo[i] = v;
                      return novo;
                    });
                  }}
                />
              </div>
            ))}
            <Botao variante="secundario" disabled={agindo} onClick={() => sortearAgora(true)}>
              Registrar{qtdPremios > 1 ? ` (${qtdPremios} vencedores)` : ""}
            </Botao>
          </div>
        </div>
      )}

      {/* Barra fixa: as duas ações que o dono mais usa, no alcance do polegar. */}
      <div className="ar-sticky-bottom">
        {vendavel && (
          <Botao className="flex-1" onClick={() => aoVenderNumeros(rifa, detalhe)}>
            <Ticket size={18} /> Vender números
          </Botao>
        )}
        <Botao className={vendavel ? "" : "flex-1"} variante={vendavel ? "secundario" : "primario"} onClick={() => aoCompartilhar(rifa)}>
          <Share2 size={18} /> Compartilhar
        </Botao>
      </div>

      <ModalConfirmar
        aberto={!!confirmacao}
        titulo={confirmacao?.titulo ?? ""}
        mensagem={confirmacao?.mensagem ?? ""}
        textoConfirmar={confirmacao?.textoConfirmar}
        variante={confirmacao?.variante}
        carregando={agindo}
        aoConfirmar={() => void confirmar()}
        aoCancelar={() => setConfirmacao(null)}
      />
    </div>
  );
};
