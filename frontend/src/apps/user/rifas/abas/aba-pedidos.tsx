/**
 * Aba Pedidos — fila de validação do PIX manual. Comprovante ao lado,
 * Confirmar aprova (números viram pagos + cota premiada dispara),
 * Rejeitar libera os números de volta pro pote.
 * Pedido PAGO com desistência: "↩ Reembolso" desfaz o pedido inteiro ou só alguns números
 * (Fabrício 10/09) — os números voltam a ficar disponíveis; o PIX o dono devolve por fora.
 */

import { Check, Link2, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavAbas } from "../componentes/abas-nav";
import { CarregandoCentro, EstadoVazio, Selo, seloDoStatus } from "../componentes/basicos";
import { Botao } from "../componentes/botao";
import { Campo } from "../componentes/campo";
import { Modal } from "../componentes/modal";
import { ModalConfirmar } from "../componentes/modal-confirmar";
import { decidirPedido, decidirReservaVencida, listarPedidosAtivos, listarPedidosHistorico, reembolsarPedido } from "../dados-rifas";
import { fmtBRL, fmtDataHora } from "../formato";
import { normalizarTelefoneBrasil } from "@/lib/telefone";
import { urlRifa } from "@/lib/url-app";
import type { PedidoRifa, Rifa } from "../tipos";

export interface AbaPedidosProps {
  pedidos: PedidoRifa[];
  rifas: Rifa[];
  carregando: boolean;
  aoMudou: () => void;
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

const FILTROS = [
  { id: "aguardando_validacao", rotulo: "A validar" },
  { id: "reservado", rotulo: "Reservados" },
  { id: "pago", rotulo: "Pagos" },
  { id: "rejeitado", rotulo: "Rejeitados" },
  { id: "expirado", rotulo: "Expirados" },
  { id: "cancelado", rotulo: "Cancelados" },
  { id: "todos", rotulo: "Todos" },
  { id: "historico", rotulo: "Histórico" },
];

const OPCOES_DIAS = [1, 3, 7, 30] as const;
type DiasHistorico = (typeof OPCOES_DIAS)[number];

const ROTULO_ORIGEM: Record<string, string> = { link: "link público", agente: "agente no WhatsApp", manual: "venda manual" };

export const AbaPedidos = ({ pedidos, rifas, carregando, aoMudou, aoNotificar }: AbaPedidosProps) => {
  // Filtro inicial esperto: sem nada a validar, abre em "todos" (evita tela vazia).
  const [filtro, setFiltro] = useState(() =>
    pedidos.some((p) => p.status === "aguardando_validacao") ? "aguardando_validacao" : "todos",
  );
  const [agindo, setAgindo] = useState<string | null>(null);
  const [rejeitando, setRejeitando] = useState<PedidoRifa | null>(null);
  const [confirmando, setConfirmando] = useState<PedidoRifa | null>(null);
  const [motivo, setMotivo] = useState("Comprovante inválido");
  // Desistência com reembolso de pedido pago: quais números saem (todos marcados ao abrir).
  const [reembolsando, setReembolsando] = useState<PedidoRifa | null>(null);
  const [numerosReembolso, setNumerosReembolso] = useState<Set<number>>(new Set());
  const [motivoReembolso, setMotivoReembolso] = useState("Desistência com reembolso");

  // Ação em massa (Theus 27/08): selecionar vários pedidos "a validar" de uma
  // vez e aprovar/rejeitar todos juntos, em vez de um por um.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmandoMassa, setConfirmandoMassa] = useState(false);
  const [rejeitandoMassa, setRejeitandoMassa] = useState(false);
  const [motivoMassa, setMotivoMassa] = useState("Comprovante inválido");
  const [progressoMassa, setProgressoMassa] = useState<{ feito: number; total: number } | null>(null);

  // "Todos" e "Histórico" não vêm mais do array gigante de `pedidos` (que a
  // `useRifas` carrega inteiro pras stats) — buscam direto, filtrado e
  // paginado no banco (`listarPedidosAtivos`/`listarPedidosHistorico`).
  // Os outros filtros (status específico) continuam vindo do array já
  // carregado — são naturalmente pequenos (fila ativa).
  const [listaTodos, setListaTodos] = useState<PedidoRifa[] | null>(null);
  const [listaHistorico, setListaHistorico] = useState<PedidoRifa[] | null>(null);
  const [diasHistorico, setDiasHistorico] = useState<DiasHistorico>(7);

  const carregarTodos = useCallback(() => {
    setListaTodos(null);
    void listarPedidosAtivos()
      .then(setListaTodos)
      .catch((e) => aoNotificar(`Falha ao carregar "Todos": ${e instanceof Error ? e.message : String(e)}`, "error"));
  }, [aoNotificar]);

  const carregarHistorico = useCallback(
    (dias: DiasHistorico) => {
      setListaHistorico(null);
      void listarPedidosHistorico(dias)
        .then(setListaHistorico)
        .catch((e) => aoNotificar(`Falha ao carregar Histórico: ${e instanceof Error ? e.message : String(e)}`, "error"));
    },
    [aoNotificar],
  );

  useEffect(() => {
    if (filtro === "todos" && listaTodos === null) carregarTodos();
    if (filtro === "historico") carregarHistorico(diasHistorico);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, diasHistorico]);

  const tituloDe = useMemo(() => Object.fromEntries(rifas.map((r) => [r.id, r.titulo])), [rifas]);
  const chaveDe = useMemo(() => Object.fromEntries(rifas.map((r) => [r.id, r.chave_publica])), [rifas]);
  const rifaSorteada = useMemo(
    () => new Set(rifas.filter((r) => r.status === "sorteada" || r.numero_sorteado != null).map((r) => r.id)),
    [rifas],
  );

  const carregandoLista =
    filtro === "todos" ? listaTodos === null : filtro === "historico" ? listaHistorico === null : carregando;

  const filtrados = useMemo(() => {
    if (filtro === "todos") return listaTodos ?? [];
    if (filtro === "historico") return listaHistorico ?? [];
    return pedidos.filter((p) => p.status === filtro);
  }, [pedidos, filtro, listaTodos, listaHistorico]);
  const totalFiltro = useMemo(() => filtrados.reduce((soma, p) => soma + (p.valor_centavos ?? 0), 0), [filtrados]);
  const decidiveisFiltrados = useMemo(
    () => filtrados.filter((p) => p.status === "aguardando_validacao" || p.status === "reservado"),
    [filtrados],
  );

  const mudarFiltro = (novo: string) => {
    setFiltro(novo);
    setSelecionados(new Set());
  };

  const alternarSelecao = (id: string, marcado: boolean) => {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  };

  const decidir = async (pedido: PedidoRifa, aprovar: boolean, motivoRejeicao: string | null) => {
    setAgindo(pedido.id);
    try {
      const r = await decidirPedido(pedido.id, aprovar, motivoRejeicao);
      if (!r.ok) {
        aoNotificar(`Recusado: ${r.erro ?? "?"}`, "error");
        return;
      }
      if (aprovar) {
        // Avisa o comprador no WhatsApp que o pagamento foi confirmado — melhor esforço.
        void fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notificar-pedido-rifa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: pedido.chave_publica, evento: "pago" }),
        }).catch(() => undefined);
      }
      if (aprovar && r.cotasPremiadasGanhas.length > 0) {
        aoNotificar(
          `Pago! 🎉 ${pedido.nome} levou cota premiada: ${r.cotasPremiadasGanhas.map((g) => `nº ${g.numero} (${g.premio})`).join(", ")}`,
          "success",
        );
      } else {
        aoNotificar(aprovar ? "Pagamento confirmado." : "Pedido rejeitado — números liberados.", "success");
      }
      aoMudou();
      if (filtro === "todos") carregarTodos();
    } finally {
      setAgindo(null);
    }
  };

  // Reserva que passou do prazo de pagamento (1h antes do sorteio) sem pagar e sem decisão
  // (Fabrício 10/09): nada acontece sozinho — o dono escolhe lançar como dívida ou não cobrar.
  const prazoVencido = (p: PedidoRifa) =>
    p.status === "reservado" && !!p.expira_em && new Date(p.expira_em).getTime() < Date.now() &&
    !p.divida_gerada_em && !p.divida_dispensada_em;

  const decidirVencida = async (pedido: PedidoRifa, decisao: "divida" | "sem_divida") => {
    setAgindo(pedido.id);
    try {
      const r = await decidirReservaVencida(pedido.id, decisao);
      if (!r.ok) {
        aoNotificar(`Não deu: ${r.erro ?? "?"}`, "error");
        return;
      }
      aoNotificar(
        decisao === "divida"
          ? `Reserva de ${pedido.nome} lançada em Dívidas.`
          : `Reserva de ${pedido.nome} fica sem cobrança — o número continua no nome da pessoa.`,
        "success",
      );
      aoMudou();
      if (filtro === "todos") carregarTodos();
    } finally {
      setAgindo(null);
    }
  };

  const abrirReembolso = (p: PedidoRifa) => {
    setNumerosReembolso(new Set(p.numeros ?? []));
    setMotivoReembolso("Desistência com reembolso");
    setReembolsando(p);
  };

  // Mesma conta do banco (rifa_reembolsar_pedido): pedido inteiro devolve o valor cheio; parte, rateio.
  const valorReembolso = (p: PedidoRifa, qtd: number) => {
    const total = (p.numeros ?? []).length;
    if (qtd >= total) return p.valor_centavos;
    return Math.round((p.valor_centavos * qtd) / Math.max(1, total));
  };

  const executarReembolso = async (p: PedidoRifa, numeros: number[], motivoTxt: string) => {
    setAgindo(p.id);
    try {
      const todos = numeros.length >= (p.numeros ?? []).length;
      const r = await reembolsarPedido(p.id, todos ? null : numeros, motivoTxt);
      if (!r.ok) {
        const erro = r.erro === "rifa_ja_sorteada" ? "a rifa já foi sorteada — não dá pra desfazer" : r.erro;
        aoNotificar(`Não deu: ${erro ?? "?"}`, "error");
        return;
      }
      const liberados = (r.numerosLiberados ?? numeros).join(", ");
      aoNotificar(
        `${r.status === "cancelado" ? "Pedido cancelado" : "Reembolso parcial feito"} — número${numeros.length === 1 ? "" : "s"} ${liberados} ` +
          `de volta à venda. Devolva ${fmtBRL(r.reembolsoCentavos ?? 0)} para ${p.nome}.`,
        "success",
      );
      aoMudou();
      if (filtro === "todos") carregarTodos();
      if (filtro === "historico") carregarHistorico(diasHistorico);
    } finally {
      setAgindo(null);
    }
  };

  // Roda um por um (não em paralelo) — cada decisão dispara efeito colateral
  // real (número vira pago, cota premiada pode sortear, avisa no WhatsApp);
  // paralelo arriscaria corrida entre decisões da mesma rifa.
  const decidirEmMassa = async (aprovar: boolean, motivoRejeicao: string | null) => {
    const alvo = pedidos.filter((p) => selecionados.has(p.id));
    if (alvo.length === 0) return;
    setProgressoMassa({ feito: 0, total: alvo.length });
    let ok = 0;
    let falharam = 0;
    const premiados: string[] = [];
    for (const [i, p] of alvo.entries()) {
      setAgindo(p.id);
      const r = await decidirPedido(p.id, aprovar, motivoRejeicao);
      if (r.ok) {
        ok++;
        if (aprovar) {
          void fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notificar-pedido-rifa`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: p.chave_publica, evento: "pago" }),
          }).catch(() => undefined);
          if (r.cotasPremiadasGanhas.length > 0) {
            premiados.push(`${p.nome}: ${r.cotasPremiadasGanhas.map((g) => `nº ${g.numero}`).join(", ")}`);
          }
        }
      } else {
        falharam++;
      }
      setProgressoMassa({ feito: i + 1, total: alvo.length });
    }
    setAgindo(null);
    setProgressoMassa(null);
    setSelecionados(new Set());
    aoMudou();
    if (filtro === "todos") carregarTodos();
    if (premiados.length > 0) aoNotificar(`🎉 Cota premiada: ${premiados.join(" · ")}`, "success");
    aoNotificar(
      `${ok} pedido${ok === 1 ? "" : "s"} ${aprovar ? "aprovado" : "rejeitado"}${falharam ? ` · ${falharam} falharam` : ""}.`,
      falharam > 0 && ok === 0 ? "error" : "success",
    );
  };

  if (carregando && filtro !== "todos" && filtro !== "historico") {
    return <CarregandoCentro rotulo="Carregando pedidos…" />;
  }

  // ── Pedaços compartilhados entre o cartão (celular) e a linha da tabela (desktop) ──
  const ehDecidivel = (p: PedidoRifa) => p.status === "aguardando_validacao" || p.status === "reservado";

  const notasDe = (p: PedidoRifa) => (
    <>
      {p.motivo_rejeicao && p.status === "rejeitado" && (
        <p className="text-sm mt-1.5" style={{ color: "var(--ar-erro)" }}>Motivo: {p.motivo_rejeicao}</p>
      )}
      {prazoVencido(p) && (
        <p className="text-sm mt-1.5" style={{ color: "var(--ar-aviso)" }}>
          ⏰ Prazo de pagamento venceu em {fmtDataHora(p.expira_em)} sem pagamento — você decide.
        </p>
      )}
      {p.status === "reservado" && p.divida_gerada_em && (
        <p className="text-sm mt-1.5" style={{ color: "var(--ar-erro)" }}>Lançada em Dívidas.</p>
      )}
      {!!p.reembolsado_em && (
        <p className="text-sm ar-txt-2 mt-1.5">
          ↩ Reembolso de <strong className="ar-txt-1">{fmtBRL(p.reembolso_centavos ?? 0)}</strong> em {fmtDataHora(p.reembolsado_em)}
          {(p.numeros_reembolsados ?? []).length > 0 && <> · números {(p.numeros_reembolsados ?? []).join(", ")}</>}
          {p.motivo_reembolso && <> · {p.motivo_reembolso}</>}
        </p>
      )}
      {p.status === "reservado" && p.divida_dispensada_em && (
        <p className="text-sm ar-txt-3 mt-1.5">Sem cobrança (você decidiu) — o número continua no nome da pessoa.</p>
      )}
    </>
  );

  const comprovanteDe = (p: PedidoRifa, grande: boolean) =>
    p.comprovante_url ? (
      <a
        href={p.comprovante_url}
        target="_blank"
        rel="noreferrer"
        title="Abrir o comprovante em tamanho cheio"
        className="ar-cartao ar-cartao--alto ar-cartao--compacto block overflow-hidden"
        style={{ padding: 6, maxWidth: grande ? "100%" : 96 }}
      >
        <img
          src={p.comprovante_url}
          alt={`Comprovante PIX de ${p.nome}`}
          className="w-full rounded-[var(--ar-r-sm)]"
          style={{ maxHeight: grande ? 260 : 72, objectFit: "contain" }}
          loading="lazy"
        />
      </a>
    ) : (
      <span className="text-sm ar-txt-4">Sem comprovante ainda</span>
    );

  const contatosDe = (p: PedidoRifa) => {
    const foneOk = normalizarTelefoneBrasil(p.phone);
    return (
      <>
        <Botao
          tamanho="sm"
          variante="fantasma"
          onClick={() => {
            const chaveRifa = chaveDe[p.rifa_id];
            if (!chaveRifa) return;
            const link = `${urlRifa(chaveRifa)}?pedido=${p.chave_publica}`;
            void navigator.clipboard.writeText(link).then(
              () => aoNotificar("Link de acompanhamento do pedido copiado.", "success"),
              () => aoNotificar("Falha ao copiar o link.", "error"),
            );
          }}
          title="Copiar o link de acompanhamento pra reenviar ao comprador"
        >
          <Link2 size={15} /> Link
        </Botao>
        {foneOk ? (
          <a
            href={`https://wa.me/${foneOk}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-[var(--ar-r-lg)] text-sm font-medium"
            style={{ background: "var(--ar-ok-vidro)", color: "var(--ar-ok)" }}
          >
            <MessageCircle size={15} /> WhatsApp
          </a>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-[var(--ar-r-lg)] text-sm ar-txt-4 cursor-not-allowed"
            style={{ background: "var(--ar-filete)" }}
            title={
              p.phone
                ? `Telefone inválido no cadastro: "${p.phone}" — corrija em Números fixos.`
                : "Esse pedido não tem telefone cadastrado (número fixo sem contato)."
            }
          >
            <MessageCircle size={15} /> Sem WhatsApp
          </span>
        )}
      </>
    );
  };

  const acoesDe = (p: PedidoRifa) => (
    <>
      {ehDecidivel(p) && (
        <>
          <Botao tamanho="sm" variante="sucesso" disabled={agindo === p.id} onClick={() => setConfirmando(p)}>
            <Check size={15} /> Confirmar pagamento
          </Botao>
          <Botao
            tamanho="sm"
            variante="perigo"
            disabled={agindo === p.id}
            onClick={() => {
              setMotivo("Comprovante inválido");
              setRejeitando(p);
            }}
          >
            Rejeitar
          </Botao>
        </>
      )}
      {p.status === "pago" && !rifaSorteada.has(p.rifa_id) && (
        <Botao
          tamanho="sm"
          variante="contorno"
          disabled={agindo === p.id}
          onClick={() => abrirReembolso(p)}
          title="Desistência: devolve o(s) número(s) à venda — o PIX você devolve por fora"
        >
          ↩ Reembolso
        </Botao>
      )}
      {prazoVencido(p) && (
        <>
          <Botao tamanho="sm" variante="perigo" disabled={agindo === p.id} onClick={() => void decidirVencida(p, "divida")}>
            Mandar pra dívida
          </Botao>
          <Botao tamanho="sm" variante="contorno" disabled={agindo === p.id} onClick={() => void decidirVencida(p, "sem_divida")}>
            Não cobrar
          </Botao>
        </>
      )}
    </>
  );

  const checkboxDe = (p: PedidoRifa) =>
    ehDecidivel(p) ? (
      <input
        type="checkbox"
        className="w-5 h-5 shrink-0 accent-[var(--ar-roxo)]"
        checked={selecionados.has(p.id)}
        onChange={(e) => alternarSelecao(p.id, e.target.checked)}
        aria-label={`Selecionar pedido de ${p.nome}`}
      />
    ) : null;

  const numerosDe = (p: PedidoRifa) => (
    <div className="ar-scroll-x">
      {(p.numeros ?? []).map((n) => (
        <span key={n} className="ar-chip-num" style={{ minHeight: 30, padding: "4px 10px" }}>
          <span className="ar-chip-num__valor">{n}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="ar-titulo-tela">Pedidos</h2>
        <p className="text-sm ar-txt-3 mt-1">
          Valide os PIX recebidos: confirmar marca os números como pagos; rejeitar devolve pro pote.
        </p>
      </div>

      {filtrados.length > 0 && (
        <div className="ar-scroll-x">
          <span className="ar-chip-num">
            <span className="ar-chip-num__rotulo">neste filtro</span>
            <span className="ar-chip-num__valor">{filtrados.length}</span>
          </span>
          <span className="ar-chip-num">
            <span className="ar-chip-num__rotulo">soma</span>
            <span className="ar-chip-num__valor">{fmtBRL(totalFiltro)}</span>
          </span>
        </div>
      )}

      <NavAbas
        abas={FILTROS.map((f) => ({
          id: f.id,
          rotulo: f.rotulo,
          contagem:
            f.id === "todos" ? listaTodos?.length
            : f.id === "historico" ? listaHistorico?.length
            : pedidos.filter((p) => p.status === f.id).length,
        }))}
        abaAtiva={filtro}
        aoMudar={mudarFiltro}
      />

      {filtro === "historico" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="ar-rotulo">Período</span>
          {OPCOES_DIAS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDiasHistorico(d)}
              className={`ar-chip ${diasHistorico === d ? "ar-chip--ativo" : ""}`}
            >
              {d} {d === 1 ? "dia" : "dias"}
            </button>
          ))}
        </div>
      )}

      {decidiveisFiltrados.length > 0 && (
        <div className="ar-cartao ar-cartao--compacto flex items-center justify-between flex-wrap gap-3">
          <label className="flex items-center gap-2.5 text-sm ar-txt-2 select-none cursor-pointer min-h-[40px]">
            <input
              type="checkbox"
              className="w-5 h-5 accent-[var(--ar-roxo)]"
              checked={decidiveisFiltrados.every((p) => selecionados.has(p.id))}
              onChange={(e) =>
                setSelecionados(e.target.checked ? new Set(decidiveisFiltrados.map((p) => p.id)) : new Set())
              }
            />
            Selecionar todos ({decidiveisFiltrados.length} a decidir)
          </label>
          {selecionados.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm ar-txt-3">{selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"}</span>
              {progressoMassa ? (
                <span className="text-sm ar-txt-3">Processando {progressoMassa.feito}/{progressoMassa.total}…</span>
              ) : (
                <>
                  <Botao tamanho="sm" variante="sucesso" onClick={() => setConfirmandoMassa(true)}>
                    <Check size={15} /> Aprovar selecionados
                  </Botao>
                  <Botao
                    tamanho="sm"
                    variante="perigo"
                    onClick={() => {
                      setMotivoMassa("Comprovante inválido");
                      setRejeitandoMassa(true);
                    }}
                  >
                    Rejeitar selecionados
                  </Botao>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {carregandoLista ? (
        <CarregandoCentro rotulo="Carregando…" />
      ) : filtrados.length === 0 ? (
        <EstadoVazio
          icone={<span>🧾</span>}
          titulo="Nenhum pedido aqui"
          descricao="Compartilhe o link da rifa ou deixe o agente vender pelo WhatsApp."
        />
      ) : (
        <>
          {/* Celular e tablet: um cartão por pedido */}
          <div className="ar-cartoes-linha">
            {filtrados.map((p) => {
              const selo = seloDoStatus(p.status);
              const selecionado = selecionados.has(p.id);
              return (
                <div
                  key={p.id}
                  className="ar-cartao"
                  style={selecionado ? { boxShadow: "0 0 0 2px var(--ar-roxo), var(--ar-relevo)" } : undefined}
                >
                  <div className="flex items-start gap-3">
                    {checkboxDe(p) && <div className="pt-1">{checkboxDe(p)}</div>}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium ar-txt-1 leading-tight truncate">{p.nome}</p>
                      <p className="text-sm ar-num ar-txt-3 mt-0.5">{p.phone ?? "sem telefone"}</p>
                      <p className="text-xs ar-txt-3 mt-1 truncate">
                        {tituloDe[p.rifa_id] ?? "Rifa"} · {fmtDataHora(p.created_at)} · via {ROTULO_ORIGEM[p.origem] ?? p.origem}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="ar-num font-bold ar-txt-1 text-[var(--ar-t-md)]">{fmtBRL(p.valor_centavos)}</span>
                      <Selo variante={selo.variante} ponto>
                        {selo.rotulo}
                      </Selo>
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="ar-rotulo mb-1.5">
                      {p.qtd_numeros} {p.qtd_numeros === 1 ? "número" : "números"}
                    </p>
                    {numerosDe(p)}
                  </div>

                  {notasDe(p)}

                  {p.status === "aguardando_validacao" && p.comprovante_url && (
                    <div className="mt-4">
                      <p className="ar-rotulo mb-1.5">Comprovante</p>
                      {comprovanteDe(p, true)}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    {p.status !== "aguardando_validacao" && comprovanteDe(p, false)}
                    {contatosDe(p)}
                  </div>
                  {(ehDecidivel(p) || (p.status === "pago" && !rifaSorteada.has(p.rifa_id)) || prazoVencido(p)) && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">{acoesDe(p)}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop: tabela */}
          <div className="ar-tabela-envelope ar-cartao" style={{ padding: "4px 8px" }}>
            <table className="ar-tabela">
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th>Comprador</th>
                  <th>Rifa · números</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Comprovante</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const selo = seloDoStatus(p.status);
                  const selecionado = selecionados.has(p.id);
                  return (
                    <tr key={p.id} style={selecionado ? { background: "var(--ar-roxo-vidro)" } : undefined}>
                      <td>{checkboxDe(p)}</td>
                      <td>
                        <p className="font-medium ar-txt-1 leading-tight">{p.nome}</p>
                        <p className="text-xs ar-num ar-txt-3 mt-0.5">{p.phone ?? "sem telefone"}</p>
                        <p className="text-xs ar-txt-4 mt-0.5">{fmtDataHora(p.created_at)} · {ROTULO_ORIGEM[p.origem] ?? p.origem}</p>
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <p className="text-sm ar-txt-2 truncate">{tituloDe[p.rifa_id] ?? "Rifa"}</p>
                        <div className="mt-1.5">{numerosDe(p)}</div>
                        {notasDe(p)}
                      </td>
                      <td className="ar-num font-bold ar-txt-1 whitespace-nowrap">{fmtBRL(p.valor_centavos)}</td>
                      <td>
                        <Selo variante={selo.variante} ponto>
                          {selo.rotulo}
                        </Selo>
                      </td>
                      <td>{comprovanteDe(p, false)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5" style={{ minWidth: 220 }}>
                          {contatosDe(p)}
                          {acoesDe(p)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Confirmação de pagamento */}
      <ModalConfirmar
        aberto={!!confirmando}
        titulo="Confirmar pagamento?"
        mensagem={
          confirmando ? (
            <>
              Confirmar o pagamento de <strong>{fmtBRL(confirmando.valor_centavos)}</strong> de{" "}
              <strong>{confirmando.nome}</strong>? Os números {(confirmando.numeros ?? []).join(", ")} viram
              PAGOS e o comprador é avisado no WhatsApp.
            </>
          ) : ""
        }
        textoConfirmar="✓ Confirmar pagamento"
        variante="sucesso"
        carregando={agindo === confirmando?.id}
        aoConfirmar={() => {
          if (!confirmando) return;
          const alvo = confirmando;
          setConfirmando(null);
          void decidir(alvo, true, null);
        }}
        aoCancelar={() => setConfirmando(null)}
      />

      {/* Modal de rejeição */}
      <Modal
        aberto={!!rejeitando}
        aoFechar={() => setRejeitando(null)}
        titulo="Rejeitar pedido"
        subtitulo={rejeitando ? `${rejeitando.nome} · ${fmtBRL(rejeitando.valor_centavos)}` : undefined}
        tamanho="sm"
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setRejeitando(null)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              carregando={agindo === rejeitando?.id}
              onClick={() => {
                if (!rejeitando) return;
                const alvo = rejeitando;
                setRejeitando(null);
                void decidir(alvo, false, motivo.trim() || "Comprovante inválido");
              }}
            >
              Rejeitar e liberar números
            </Botao>
          </>
        }
      >
        <Campo
          rotulo="Motivo (o comprador vê)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Comprovante inválido"
        />
      </Modal>

      {/* Desistência com reembolso (pedido pago) */}
      <Modal
        aberto={!!reembolsando}
        aoFechar={() => setReembolsando(null)}
        titulo="Desistência com reembolso"
        subtitulo={reembolsando ? `${reembolsando.nome} · pagou ${fmtBRL(reembolsando.valor_centavos)}` : undefined}
        tamanho="sm"
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setReembolsando(null)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              disabled={numerosReembolso.size === 0}
              carregando={agindo === reembolsando?.id}
              onClick={() => {
                if (!reembolsando || numerosReembolso.size === 0) return;
                const alvo = reembolsando;
                const nums = [...numerosReembolso].sort((a, b) => a - b);
                setReembolsando(null);
                void executarReembolso(alvo, nums, motivoReembolso.trim() || "Desistência com reembolso");
              }}
            >
              ↩ Devolver {numerosReembolso.size} número{numerosReembolso.size === 1 ? "" : "s"} à venda
            </Botao>
          </>
        }
      >
        {reembolsando && (
          <div className="space-y-4">
            <div>
              <p className="ar-rotulo mb-2">Quais números saem?</p>
              <div className="flex flex-wrap gap-2">
                {(reembolsando.numeros ?? []).map((n) => {
                  const marcado = numerosReembolso.has(n);
                  return (
                    <label
                      key={n}
                      className="ar-celula cursor-pointer select-none"
                      style={{
                        minWidth: 44,
                        aspectRatio: "auto",
                        padding: "0 10px",
                        background: marcado ? "var(--ar-erro)" : undefined,
                        color: marcado ? "#fff" : undefined,
                      }}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={marcado}
                        onChange={(e) =>
                          setNumerosReembolso((atual) => {
                            const novo = new Set(atual);
                            if (e.target.checked) novo.add(n);
                            else novo.delete(n);
                            return novo;
                          })
                        }
                      />
                      {n}
                    </label>
                  );
                })}
              </div>
            </div>
            <p className="text-sm ar-txt-2">
              Valor a devolver:{" "}
              <strong className="ar-txt-1 ar-num">{fmtBRL(valorReembolso(reembolsando, numerosReembolso.size))}</strong>
              {numerosReembolso.size > 0 && numerosReembolso.size < (reembolsando.numeros ?? []).length && (
                <span className="ar-txt-3"> (proporcional ao que pagou) — o pedido segue pago com os outros números</span>
              )}
              {numerosReembolso.size > 0 && numerosReembolso.size >= (reembolsando.numeros ?? []).length && (
                <span className="ar-txt-3"> — o pedido fica cancelado</span>
              )}
            </p>
            <Campo
              rotulo="Motivo (fica registrado no pedido)"
              value={motivoReembolso}
              onChange={(e) => setMotivoReembolso(e.target.value)}
              placeholder="Desistência com reembolso"
            />
            <p className="ar-aviso-box text-xs">
              Os números voltam a ficar disponíveis na hora (cartela, página da rifa e Lucy). O PIX você devolve por fora —
              o sistema não faz o estorno. Não dá pra desfazer: pra devolver o número à pessoa, faça uma venda nova.
            </p>
          </div>
        )}
      </Modal>

      {/* Confirmação de pagamento em massa */}
      <ModalConfirmar
        aberto={confirmandoMassa}
        titulo="Confirmar pagamento em massa?"
        mensagem={
          <>
            Confirmar o pagamento de <strong>{selecionados.size}</strong> pedido{selecionados.size === 1 ? "" : "s"}{" "}
            selecionado{selecionados.size === 1 ? "" : "s"}? Os números viram PAGOS e cada comprador é avisado no
            WhatsApp.
          </>
        }
        textoConfirmar="✓ Confirmar todos"
        variante="sucesso"
        carregando={!!progressoMassa}
        aoConfirmar={() => {
          setConfirmandoMassa(false);
          void decidirEmMassa(true, null);
        }}
        aoCancelar={() => setConfirmandoMassa(false)}
      />

      {/* Rejeição em massa */}
      <Modal
        aberto={rejeitandoMassa}
        aoFechar={() => setRejeitandoMassa(false)}
        titulo="Rejeitar pedidos selecionados"
        subtitulo={`${selecionados.size} pedido${selecionados.size === 1 ? "" : "s"}`}
        tamanho="sm"
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setRejeitandoMassa(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              carregando={!!progressoMassa}
              onClick={() => {
                setRejeitandoMassa(false);
                void decidirEmMassa(false, motivoMassa.trim() || "Comprovante inválido");
              }}
            >
              Rejeitar e liberar números
            </Botao>
          </>
        }
      >
        <Campo
          rotulo="Motivo (todos os comprovantes vão receber o mesmo motivo)"
          value={motivoMassa}
          onChange={(e) => setMotivoMassa(e.target.value)}
          placeholder="Comprovante inválido"
        />
      </Modal>
    </div>
  );
};
