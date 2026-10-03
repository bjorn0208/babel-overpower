/**
 * Compra + pedido da rifa pública.
 * CompraRifa: quantidade (ou números escolhidos no grid quando rifa ≤ 1000) + nome/WhatsApp.
 * PedidoRifa: números reservados + PIX + envio de comprovante + status.
 * Visual "Arena" (classes arp-*, arena-publica.css).
 */

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Copy, Paperclip } from "lucide-react";
import type { DadosRifaPublica, PedidoRifaPublico } from "./use-rifa-publica";
import { fmtBRL } from "./use-rifa-publica";

const LIMITE_GRID = 1000; // acima disso a escolha manual vira campo de texto

export function CompraRifa({
  dados,
  pedidoAberto,
  onReservar,
  onVoltar,
}: {
  dados: DadosRifaPublica;
  /** Pedido reservado/rejeitado já aberto — os números novos entram nele (mesmo PIX). */
  pedidoAberto?: { nome: string; phone: string | null; numeros: number[] } | null;
  onReservar: (
    nome: string,
    phone: string,
    qtd: number,
    numeros: number[] | null,
  ) => Promise<string | null>;
  onVoltar: () => void;
}) {
  const r = dados.rifa;
  // Faixa real da numeração (fix 25/08: desde-zero = 00..99 numa rifa de 100)
  const numMin = r.numeracao_desde_zero ? 0 : 1;
  const numMax = numMin + r.total_numeros - 1;
  const largura = String(numMax).length;
  const [modo, setModo] = useState<"aleatorio" | "escolher">("aleatorio");
  const [qtd, setQtd] = useState(1);
  const [escolhidos, setEscolhidos] = useState<Set<number>>(new Set());
  const [nome, setNome] = useState(pedidoAberto?.nome ?? "");
  const [phone, setPhone] = useState(pedidoAberto?.phone ?? "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Números ocupados vêm prontos de obter_rifa_por_token (null em rifas >1000
  // números — aí o grid vira campo de texto e a reserva tudo-ou-nada resolve
  // colisão). pagos = já confirmados; o resto de ocupados = reservado/a validar.
  const pagos = useMemo(() => new Set(dados.numeros_pagos ?? []), [dados.numeros_pagos]);
  const ocupados = useMemo(() => new Set(dados.numeros_ocupados ?? []), [dados.numeros_ocupados]);
  const numerosComNome = useMemo(() => new Map(
    (dados.numeros_com_nome ?? []).map(n => [n.numero, n])
  ), [dados.numeros_com_nome]);

  const qtdEfetiva = modo === "escolher" ? escolhidos.size : qtd;

  const valor = useMemo(() => {
    let restante = qtdEfetiva;
    let total = 0;
    const promos = [...r.promocoes].sort((a, b) => b.qtd - a.qtd);
    for (const p of promos) {
      while (restante >= p.qtd) {
        total += p.preco_total_centavos;
        restante -= p.qtd;
      }
    }
    return total + restante * r.preco_numero_centavos;
  }, [qtdEfetiva, r]);

  const alternarNumero = (n: number) => {
    setEscolhidos((s) => {
      const novo = new Set(s);
      if (novo.has(n)) novo.delete(n);
      else if (novo.size < r.max_numeros_por_pedido) novo.add(n);
      return novo;
    });
  };

  const confirmar = async () => {
    setErro(null);
    const fone = phone.replace(/\D/g, "");
    if (!nome.trim()) {
      setErro("Informe seu nome.");
      return;
    }
    if (fone.length < 11) {
      setErro("Informe um WhatsApp válido com DDD.");
      return;
    }
    if (qtdEfetiva < 1) {
      setErro("Escolha pelo menos 1 número.");
      return;
    }
    setEnviando(true);
    const msg = await onReservar(
      nome.trim(),
      fone,
      qtdEfetiva,
      modo === "escolher" ? [...escolhidos] : null,
    );
    setEnviando(false);
    if (msg) setErro(msg);
  };

  const limitarQtd = (n: number) => Math.max(1, Math.min(r.max_numeros_por_pedido, n));
  const atalhos = [5, 10, 50].filter((n) => n <= r.max_numeros_por_pedido);

  return (
    <div>
      <h2>Garanta seus números</h2>

      {pedidoAberto && (
        <div
          className="arp-cartao arp-cartao--compacto arp-cartao--alto"
          style={{ marginTop: "var(--ar-s-4)", fontSize: "var(--ar-t-sm)" }}
        >
          Você já tem{" "}
          <strong>
            {pedidoAberto.numeros.length} número{pedidoAberto.numeros.length === 1 ? "" : "s"}
          </strong>{" "}
          reservado{pedidoAberto.numeros.length === 1 ? "" : "s"} nesse pedido — os novos entram
          junto, mesmo PIX.
        </div>
      )}

      <div className="arp-seg" style={{ marginTop: "var(--ar-s-5)" }}>
        <button
          type="button"
          className={`arp-seg__item${modo === "aleatorio" ? " arp-seg__item--ativo" : ""}`}
          onClick={() => setModo("aleatorio")}
        >
          Aleatórios
        </button>
        <button
          type="button"
          className={`arp-seg__item${modo === "escolher" ? " arp-seg__item--ativo" : ""}`}
          onClick={() => setModo("escolher")}
        >
          Escolher números
        </button>
      </div>

      {modo === "aleatorio" && (
        <div className="arp-secao">
          <span className="arp-rotulo">Quantos números?</span>
          <div className="arp-stepper">
            <button
              type="button"
              className="arp-stepper__btn"
              aria-label="Menos um número"
              disabled={qtd <= 1}
              onClick={() => setQtd((q) => limitarQtd(q - 1))}
            >
              <Minus size={22} />
            </button>
            <input
              className="arp-stepper__campo"
              type="number"
              inputMode="numeric"
              min={1}
              max={r.max_numeros_por_pedido}
              value={qtd}
              aria-label="Quantidade de números"
              onChange={(e) => setQtd(limitarQtd(parseInt(e.target.value, 10) || 1))}
            />
            <button
              type="button"
              className="arp-stepper__btn"
              aria-label="Mais um número"
              disabled={qtd >= r.max_numeros_por_pedido}
              onClick={() => setQtd((q) => limitarQtd(q + 1))}
            >
              <Plus size={22} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2" style={{ marginTop: "var(--ar-s-3)" }}>
            {atalhos.map((n) => (
              <button
                key={n}
                type="button"
                className="arp-chip"
                onClick={() => setQtd((q) => limitarQtd(q + n))}
              >
                +{n}
              </button>
            ))}
          </div>
        </div>
      )}

      {modo === "escolher" && r.total_numeros <= LIMITE_GRID && (
        <div className="arp-secao">
          <span className="arp-rotulo">Toque nos números ({escolhidos.size} escolhidos)</span>
          <div className="arp-legenda">
            <span>
              <i className="arp-pt-pago" />
              pago
            </span>
            <span>
              <i className="arp-pt-reservado" />
              reservado
            </span>
            <span>
              <i className="arp-pt-livre" />
              disponível
            </span>
          </div>
          <div className="arp-grade">
            {Array.from({ length: r.total_numeros }, (_, i) => numMin + i).map((n) => {
              const marcado = escolhidos.has(n);
              const pago = pagos.has(n);
              const indisponivel = ocupados.has(n);
              const reservado = indisponivel && !pago;
              const infoNome = numerosComNome.get(n);
              return (
                <button
                  key={n}
                  type="button"
                  disabled={indisponivel}
                  onClick={() => alternarNumero(n)}
                  aria-pressed={marcado}
                  title={
                    pago ? "Já pago" : reservado ? "Reservado — aguardando validação" : undefined
                  }
                  className={
                    "arp-grade__cel" +
                    (pago
                      ? " arp-grade__cel--pago"
                      : reservado
                        ? " arp-grade__cel--reservado"
                        : marcado
                          ? " arp-grade__cel--sel"
                          : "")
                  }
                >
                  <span className="arp-grade__num">{String(n).padStart(largura, "0")}</span>
                  {infoNome && (
                    <span className="arp-grade__nome" title={`${infoNome.nome} • ${infoNome.phone_mascarado}`}>
                      {infoNome.nome}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {modo === "escolher" && r.total_numeros > LIMITE_GRID && (
        <div className="arp-secao">
          <span className="arp-rotulo">Digite os números separados por vírgula</span>
          <input
            className="arp-campo"
            inputMode="numeric"
            placeholder="ex.: 7, 77, 777"
            onChange={(e) => {
              const ns = e.target.value
                .split(/[,\s]+/)
                .map((x) => parseInt(x, 10))
                .filter((n) => n >= numMin && n <= numMax);
              setEscolhidos(new Set(ns.slice(0, r.max_numeros_por_pedido)));
            }}
          />
        </div>
      )}

      <div className="arp-secao">
        <span className="arp-rotulo">Seu nome</span>
        <input
          className="arp-campo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome completo"
        />
      </div>
      <div style={{ marginTop: "var(--ar-s-4)" }}>
        <span className="arp-rotulo">Seu WhatsApp</span>
        <input
          className="arp-campo"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="11 dígitos (com ou sem formatação)"
          inputMode="tel"
        />
      </div>

      {erro && (
        <div role="alert" className="arp-erro" style={{ marginTop: "var(--ar-s-4)" }}>
          {erro}
        </div>
      )}

      <button
        className="arp-btn arp-btn--fantasma arp-btn--bloco"
        type="button"
        onClick={onVoltar}
        style={{ marginTop: "var(--ar-s-4)" }}
      >
        Voltar pra rifa
      </button>

      <div className="arp-resumo">
        <div className="arp-resumo__linha">
          <span className="arp-resumo__qtd">
            {qtdEfetiva} número{qtdEfetiva === 1 ? "" : "s"}
          </span>
          <span className="arp-resumo__total">{fmtBRL(valor)}</span>
        </div>
        <button
          className="arp-btn arp-btn--primario arp-btn--bloco arp-btn--grande"
          type="button"
          onClick={confirmar}
          disabled={enviando}
        >
          {enviando ? "Reservando…" : "Reservar meus números"}
        </button>
      </div>
    </div>
  );
}

export function PedidoRifa({
  pedido,
  onEnviarComprovante,
  onUpload,
  onNovaCompra,
  onAdicionarMais,
  onVoltarVitrine,
}: {
  pedido: PedidoRifaPublico;
  onEnviarComprovante: (url: string) => Promise<boolean>;
  onUpload: (file: File) => Promise<string | null>;
  onNovaCompra: () => void;
  /** Pega mais números pro MESMO pedido (só antes de mandar comprovante). */
  onAdicionarMais: () => void;
  onVoltarVitrine: () => void;
}) {
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Countdown mm:ss da reserva — tick de 1s enquanto o pedido tiver expira_em
  // (previsto no plano v2, nunca implementado; só mostrava horário fixo).
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!pedido.expira_em) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pedido.expira_em]);
  const restanteMs = pedido.expira_em ? new Date(pedido.expira_em).getTime() - agora : null;
  const restanteFmt = (() => {
    if (restanteMs === null) return null;
    if (restanteMs <= 0) return null;
    const totalSeg = Math.floor(restanteMs / 1000);
    const mm = String(Math.floor(totalSeg / 60)).padStart(2, "0");
    const ss = String(totalSeg % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  })();

  const escolherArquivo = async (file: File | undefined) => {
    if (!file) return;
    setErro(null);
    setSubindo(true);
    const url = await onUpload(file);
    if (!url) {
      setErro("Falha ao enviar o comprovante. Tente de novo.");
      setSubindo(false);
      return;
    }
    const ok = await onEnviarComprovante(url);
    if (!ok) setErro("Não foi possível registrar o comprovante.");
    setSubindo(false);
  };

  const copiarPix = () => {
    if (!pedido.chave_pix) return;
    void navigator.clipboard?.writeText(pedido.chave_pix);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const aguardandoPagamento = pedido.status === "reservado" || pedido.status === "rejeitado";
  const emValidacao = pedido.status === "aguardando_validacao";
  const pago = pedido.status === "pago";
  const expirado = pedido.status === "expirado" || pedido.status === "cancelado";
  const largura = String(Math.max(...pedido.numeros, 9)).length;

  return (
    <div>
      <span
        className={
          "arp-selo arp-selo--grande " +
          (pago
            ? "arp-selo--ok"
            : expirado
              ? "arp-selo--erro"
              : emValidacao
                ? "arp-selo--info"
                : "arp-selo--aviso")
        }
      >
        {pago
          ? "Números confirmados"
          : expirado
            ? "Reserva expirada"
            : emValidacao
              ? "Comprovante em análise"
              : "Aguardando pagamento"}
      </span>

      <h2 style={{ marginTop: "var(--ar-s-3)" }}>Seu pedido</h2>
      <div
        style={{ fontSize: "var(--ar-t-sm)", color: "var(--ar-txt-3)", marginTop: "var(--ar-s-1)" }}
      >
        {pedido.rifa_titulo} · {pedido.nome}
      </div>

      <div className="flex flex-wrap gap-2" style={{ marginTop: "var(--ar-s-4)" }}>
        {pedido.numeros.map((n) => (
          <span key={n} className={`arp-num-chip${pago ? " arp-num-chip--pago" : ""}`}>
            {String(n).padStart(largura, "0")}
          </span>
        ))}
      </div>

      {aguardandoPagamento && (
        <>
          {pedido.status === "rejeitado" && (
            <div role="alert" className="arp-erro" style={{ marginTop: "var(--ar-s-4)" }}>
              Comprovante rejeitado{pedido.motivo_rejeicao ? `: ${pedido.motivo_rejeicao}` : ""}.
              Envie outro.
            </div>
          )}

          <div className="arp-secao arp-cartao">
            <span className="arp-rotulo">Valor a pagar via PIX</span>
            <div className="arp-pix__valor">{fmtBRL(pedido.valor_centavos)}</div>

            {pedido.chave_pix ? (
              <div style={{ marginTop: "var(--ar-s-3)" }}>
                <code className="arp-pix__codigo">{pedido.chave_pix}</code>
                <button
                  className="arp-btn arp-btn--secundario arp-btn--bloco"
                  type="button"
                  onClick={copiarPix}
                  style={{ marginTop: "var(--ar-s-2)" }}
                >
                  <Copy size={16} />
                  {copiado ? "Copiado!" : "Copiar chave PIX"}
                </button>
              </div>
            ) : (
              <div className="arp-aviso-txt" style={{ marginTop: "var(--ar-s-2)" }}>
                O organizador ainda não configurou a chave PIX — chame ele no WhatsApp.
              </div>
            )}

            {pedido.expira_em && (
              <div
                style={{
                  marginTop: "var(--ar-s-3)",
                  fontSize: "var(--ar-t-xs)",
                  color: restanteFmt ? "var(--ar-txt-3)" : "var(--ar-erro)",
                }}
              >
                {restanteFmt ? (
                  <>
                    Reserva expira em <strong className="arp-num">{restanteFmt}</strong> — depois os
                    números voltam pro pote.
                  </>
                ) : (
                  "Reserva expirada — os números podem ter voltado pro pote."
                )}
              </div>
            )}
          </div>

          <label className="arp-upload" style={{ marginTop: "var(--ar-s-4)" }}>
            <Paperclip size={20} />
            {subindo ? "Enviando…" : "Enviar comprovante do PIX"}
            <span className="arp-upload__dica">Toque pra escolher a foto ou o PDF</span>
            <input
              type="file"
              accept="image/*,.pdf"
              hidden
              disabled={subindo}
              onChange={(e) => void escolherArquivo(e.target.files?.[0])}
            />
          </label>
        </>
      )}

      {emValidacao && (
        <div
          className="arp-secao arp-cartao arp-cartao--alto"
          style={{ fontSize: "var(--ar-t-sm)" }}
        >
          Comprovante recebido. O organizador vai confirmar o pagamento e seus números ficam
          garantidos.
        </div>
      )}

      {pago && (
        <div
          className="arp-secao"
          style={{ fontSize: "var(--ar-t-sm)", color: "var(--ar-txt-2)" }}
        >
          Pagamento confirmado
          {pedido.pago_em ? ` em ${new Date(pedido.pago_em).toLocaleDateString("pt-BR")}` : ""}. Boa
          sorte!
        </div>
      )}

      {expirado && (
        <div
          className="arp-secao"
          style={{ fontSize: "var(--ar-t-sm)", color: "var(--ar-txt-3)" }}
        >
          O prazo de pagamento passou e os números voltaram pro pote. Faça uma nova compra.
        </div>
      )}

      {erro && (
        <div role="alert" className="arp-erro" style={{ marginTop: "var(--ar-s-4)" }}>
          {erro}
        </div>
      )}

      <div className="arp-acoes" style={{ marginTop: "var(--ar-s-6)" }}>
        <button className="arp-btn arp-btn--fantasma" type="button" onClick={onVoltarVitrine}>
          Ver a rifa
        </button>
        {aguardandoPagamento && (
          <button className="arp-btn arp-btn--secundario" type="button" onClick={onAdicionarMais}>
            Pegar mais números
          </button>
        )}
        {(pago || expirado) && (
          <button className="arp-btn arp-btn--primario" type="button" onClick={onNovaCompra}>
            Comprar mais números
          </button>
        )}
      </div>
    </div>
  );
}
