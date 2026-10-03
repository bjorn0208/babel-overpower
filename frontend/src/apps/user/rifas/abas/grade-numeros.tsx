/**
 * Grade de números + venda manual do dono: escolhe números (ou quantidade
 * aleatória quando a rifa tem >1000 números), informa nome/phone do comprador
 * e reserva via `reservar_numeros_rifa_publico` origem 'manual' (tudo-ou-nada).
 *
 * Arena (2026-09-12): grade em `.ar-grade`/`.ar-celula`, legenda em chips e a
 * barra de venda numa `.ar-sticky-bottom`. A grade rola só na vertical.
 */

import { ArrowLeft, Check, Copy, Dices, Eraser } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { valorComPromocoes } from "../calculos";
import { faixaNumeros } from "../formato";
import { Botao } from "../componentes/botao";
import { Campo } from "../componentes/campo";
import { Modal } from "../componentes/modal";
import { obterStatusNumeros, venderManual, venderManualPorQuantidade, type ResultadoVendaManual } from "../dados-rifas";
import { urlRifa } from "@/lib/url-app";
import { fmtBRL, fmtDataHora } from "../formato";
import type { DetalheRifa, Rifa, StatusPedidoRifa } from "../tipos";
import "./grade-numeros.css";

// Cor por status do pedido — MESMO código em toda tela que mostra número da
// rifa (pedido Theus 2026-09-01): roxo = validado pelo rifeiro (comprovante
// confirmado), âmbar = comprovante enviado mas falta validar, filete =
// reservado sem comprovante ainda, chumbo = disponível.
const CORES_STATUS_NUMERO: Record<StatusPedidoRifa | "disponivel", { classe: string; rotulo: string }> = {
  disponivel: { classe: "", rotulo: "Disponível" },
  reservado: { classe: "ar-celula--reserva ar-celula--bloqueado", rotulo: "Reservado (sem comprovante)" },
  aguardando_validacao: { classe: "ar-celula--reservado ar-celula--bloqueado", rotulo: "Aguardando validação" },
  pago: { classe: "ar-celula--pago ar-celula--bloqueado", rotulo: "Validado" },
  expirado: { classe: "", rotulo: "Disponível" },
  cancelado: { classe: "", rotulo: "Disponível" },
  rejeitado: { classe: "", rotulo: "Disponível" },
};

export interface GradeNumerosProps {
  rifa: Rifa;
  detalhe: DetalheRifa | null;
  aoVoltar: () => void;
  aoVendeu: () => void;
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

export const GradeNumeros = ({ rifa, detalhe, aoVoltar, aoVendeu, aoNotificar }: GradeNumerosProps) => {
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [qtdAleatoria, setQtdAleatoria] = useState("1");
  const [modalComprador, setModalComprador] = useState<null | "numeros" | "aleatorio">(null);
  const [nome, setNome] = useState("");
  const [phone, setPhone] = useState("");
  const [vendendo, setVendendo] = useState(false);
  const [venda, setVenda] = useState<ResultadoVendaManual | null>(null);
  const [statusPorNumero, setStatusPorNumero] = useState<Record<number, StatusPedidoRifa>>({});

  // Busca o status real (reservado/aguardando_validacao/pago) de cada número
  // ocupado — refaz sempre que `detalhe` muda (mesmo gatilho que já recarrega
  // a grade após uma venda ou evento de tempo real), pra cor não ficar velha.
  useEffect(() => {
    let cancelado = false;
    obterStatusNumeros(rifa.id)
      .then((mapa) => { if (!cancelado) setStatusPorNumero(mapa); })
      .catch((e) => {
        if (cancelado) return;
        // Cai pro fallback binário de `ocupados` abaixo (grade continua usável),
        // mas o dono precisa saber que a cor detalhada não carregou.
        aoNotificar(`Não deu pra carregar o status detalhado dos números: ${e instanceof Error ? e.message : String(e)}`, "error");
      });
    return () => { cancelado = true; };
  }, [rifa.id, detalhe, aoNotificar]);

  const ocupados = useMemo(() => new Set(detalhe?.numeros_ocupados ?? []), [detalhe]);
  // Só visual: número com prêmio na cota ganha a célula rosa (e o prêmio no title).
  const premiados = useMemo(
    () => new Map((rifa.cotas_premiadas ?? []).map((c) => [c.numero, c.premio])),
    [rifa.cotas_premiadas],
  );
  const temGrade = rifa.total_numeros <= 1000 && detalhe?.numeros_ocupados !== null && detalhe !== null;
  // Faixa real: desde-zero = 0..total-1 (bug "rifa de 100 parecia 1000", 25/08)
  const { min: numMin, max: numMax, largura } = faixaNumeros(rifa);

  const alternar = (n: number) => {
    setSelecionados((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= rifa.max_numeros_por_pedido) {
        aoNotificar(`Máximo de ${rifa.max_numeros_por_pedido} números por pedido.`, "error");
        return prev;
      }
      return [...prev, n];
    });
  };

  const surpresinha = (quantos: number) => {
    const livres: number[] = [];
    for (let n = numMin; n <= numMax; n++) {
      if (!ocupados.has(n) && !selecionados.includes(n)) livres.push(n);
    }
    const escolhidos: number[] = [];
    while (escolhidos.length < quantos && livres.length > 0) {
      const i = Math.floor(Math.random() * livres.length);
      escolhidos.push(livres.splice(i, 1)[0]!);
    }
    setSelecionados((prev) => [...prev, ...escolhidos].slice(0, rifa.max_numeros_por_pedido));
  };

  const confirmarVenda = async () => {
    const soDigitos = phone.replace(/\D/g, "");
    if (!nome.trim() || soDigitos.length < 10) {
      aoNotificar("Nome e phone com DDD são obrigatórios.", "error");
      return;
    }
    setVendendo(true);
    try {
      const numeros = modalComprador === "numeros" ? selecionados : [];
      const r =
        modalComprador === "numeros"
          ? await venderManual(rifa.chave_publica, nome.trim(), soDigitos, numeros)
          : await venderManualPorQuantidade(rifa.chave_publica, nome.trim(), soDigitos, Number.parseInt(qtdAleatoria, 10) || 1);
      if (!r.ok) {
        aoNotificar(r.erro ?? "Falha na reserva.", "error");
        return;
      }
      setVenda(r);
      setModalComprador(null);
      setSelecionados([]);
      aoVendeu();
    } finally {
      setVendendo(false);
    }
  };

  const valorPreview = valorComPromocoes(selecionados.length, rifa.preco_numero_centavos, rifa.promocoes ?? []);
  const disponiveis = detalhe ? detalhe.progresso.disponiveis : rifa.total_numeros - ocupados.size;

  // Tela de venda concluída
  if (venda) {
    const linkPedido = `${urlRifa(rifa.chave_publica)}?pedido=${venda.pedidoToken}`;
    return (
      <div className="max-w-md mx-auto text-center space-y-5 py-8">
        <div className="ar-vazio__icone mx-auto" aria-hidden>
          <Check size={34} />
        </div>
        <div>
          <h2 className="ar-titulo-secao">Números reservados!</h2>
          <p className="text-sm ar-txt-3 mt-2">
            Pedido de <strong className="ar-txt-1">{nome}</strong> criado como venda manual. Agora é só o comprador pagar o PIX
            e você confirmar na aba Pedidos.
          </p>
        </div>

        <div className="ar-cartao text-left">
          <div className="ar-lista">
            <div className="ar-linha">
              <span className="ar-rotulo shrink-0">Números</span>
              <span className="ar-num text-sm ar-txt-1 ml-auto text-right">{(venda.numeros ?? []).join(", ")}</span>
            </div>
            <div className="ar-linha">
              <span className="ar-rotulo shrink-0">Valor</span>
              <span className="ar-num text-sm ar-txt-1 ml-auto">{fmtBRL(venda.valorCentavos)}</span>
            </div>
            {venda.chavePix && (
              <div className="ar-linha">
                <span className="ar-rotulo shrink-0">Chave PIX</span>
                <span className="ar-num text-sm ar-txt-1 ml-auto text-right break-all">{venda.chavePix}</span>
              </div>
            )}
            {venda.expiraEm && (
              <div className="ar-linha">
                <span className="ar-rotulo shrink-0">Reserva expira</span>
                <span className="text-sm ar-txt-2 ml-auto">{fmtDataHora(venda.expiraEm)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          <Botao
            variante="secundario"
            onClick={() => {
              navigator.clipboard?.writeText(linkPedido);
              aoNotificar("Link do pedido copiado — manda pro comprador anexar o comprovante.", "success");
            }}
          >
            <Copy size={16} /> Copiar link do pedido
          </Botao>
          <Botao onClick={aoVoltar}>Voltar à rifa</Botao>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <button type="button" onClick={aoVoltar} className="ar-icone-btn shrink-0" aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="ar-rotulo">Vender números</p>
          <h2 className="ar-titulo-tela truncate">{rifa.titulo}</h2>
        </div>
      </div>

      <div className="ar-scroll-x -mx-4 px-4">
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">por número</span>
          <span className="ar-chip-num__valor">{fmtBRL(rifa.preco_numero_centavos)}</span>
        </span>
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">disponíveis</span>
          <span className="ar-chip-num__valor" style={{ color: "var(--ar-ok)" }}>{disponiveis}</span>
        </span>
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">máx. por pedido</span>
          <span className="ar-chip-num__valor">{rifa.max_numeros_por_pedido}</span>
        </span>
      </div>

      {temGrade ? (
        <>
          {/* Legenda */}
          <div className="ar-legenda">
            <Legenda cor="var(--ar-cartao-alto)" rotulo="Disponível" />
            <Legenda cor="var(--ar-cartao-alto)" anel rotulo="Selecionado" />
            <Legenda cor="var(--ar-filete)" rotulo="Reservado (sem comprovante)" />
            <Legenda cor="var(--ar-aviso)" rotulo="Aguardando validação" />
            <Legenda cor="var(--ar-roxo)" rotulo="Validado" />
            {premiados.size > 0 && <Legenda cor="var(--ar-rosa)" rotulo="Cota premiada" />}
          </div>

          {/* Ações rápidas */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => surpresinha(5)} className="ar-chip">
              <Dices size={16} /> +5 da sorte
            </button>
            {selecionados.length > 0 && (
              <button type="button" onClick={() => setSelecionados([])} className="ar-chip">
                <Eraser size={16} /> Limpar ({selecionados.length})
              </button>
            )}
          </div>

          {/* Grade */}
          <div className="ar-grade-rolo">
            <div className="ar-grade">
              {Array.from({ length: rifa.total_numeros }, (_, i) => {
                const n = numMin + i;
                // Status real (funil do pedido) quando já carregou; senão cai no
                // flat `ocupados` da RPC pública (fallback: mostra reservado até
                // a query tenant-scoped responder — nunca deixa clicável à toa).
                const status = statusPorNumero[n] ?? (ocupados.has(n) ? "reservado" : undefined);
                const ocupado = status !== undefined;
                const marcado = selecionados.includes(n);
                const premio = premiados.get(n);
                const cor = status ? CORES_STATUS_NUMERO[status].classe : premio ? "ar-celula--premiado" : "";
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={ocupado}
                    onClick={() => alternar(n)}
                    className={`ar-celula ${cor} ${marcado ? "ar-celula--selecionado" : ""}`}
                    title={
                      `Número ${String(n).padStart(largura, "0")}` +
                      (status ? ` — ${CORES_STATUS_NUMERO[status].rotulo}` : "") +
                      (premio ? ` — cota premiada: ${premio}` : "")
                    }
                  >
                    {String(n).padStart(largura, "0")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Barra de venda */}
          <div className="ar-sticky-bottom flex-wrap justify-between">
            <div className="min-w-0">
              <p className="ar-rotulo">
                {selecionados.length} número{selecionados.length === 1 ? "" : "s"} selecionado{selecionados.length === 1 ? "" : "s"}
              </p>
              <p className="ar-num font-bold ar-txt-1 text-[var(--ar-t-md)] leading-tight mt-0.5">
                {fmtBRL(valorPreview)}
                {selecionados.length > 0 && <span className="ar-rotulo ml-2">com promoções</span>}
              </p>
            </div>
            <Botao onClick={() => setModalComprador("numeros")} disabled={selecionados.length === 0}>
              Vender
            </Botao>
          </div>
        </>
      ) : (
        <div className="ar-cartao max-w-md space-y-4">
          <p className="text-sm ar-txt-2">
            Rifa com mais de 1.000 números — a grade fica de fora pra não pesar. Venda por quantidade: o sistema sorteia
            números livres.
          </p>
          <Campo
            rotulo="Quantos números?"
            type="number"
            min={1}
            max={rifa.max_numeros_por_pedido}
            value={qtdAleatoria}
            onChange={(e) => setQtdAleatoria(e.target.value)}
          />
          <Botao onClick={() => setModalComprador("aleatorio")}>
            <Dices size={16} /> Reservar aleatórios pro comprador
          </Botao>
        </div>
      )}

      {/* Modal do comprador */}
      <Modal
        aberto={!!modalComprador}
        aoFechar={() => setModalComprador(null)}
        titulo="Dados do comprador"
        subtitulo={
          modalComprador === "numeros"
            ? `${selecionados.length} números · ${fmtBRL(valorPreview)}`
            : `${qtdAleatoria} números aleatórios`
        }
        tamanho="sm"
        rodape={
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setModalComprador(null)}>
              Cancelar
            </Botao>
            <Botao carregando={vendendo} onClick={() => void confirmarVenda()}>
              Reservar números
            </Botao>
          </div>
        }
      >
        <div className="space-y-4">
          <Campo rotulo="Nome *" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria da Silva" />
          <Campo rotulo="WhatsApp (com DDD) *" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11 99999-0000" />
          <p className="text-xs ar-txt-4">
            A reserva segue a regra da rifa: expira em {rifa.minutos_reserva} min se o PIX não for confirmado.
          </p>
        </div>
      </Modal>
    </div>
  );
};

const Legenda = ({ cor, rotulo, anel = false }: { cor: string; rotulo: string; anel?: boolean }) => (
  <span className="ar-legenda__item">
    <span
      className="ar-legenda__ponto"
      style={{ background: cor, boxShadow: anel ? "0 0 0 2px var(--ar-roxo-alto)" : undefined }}
    />
    {rotulo}
  </span>
);
