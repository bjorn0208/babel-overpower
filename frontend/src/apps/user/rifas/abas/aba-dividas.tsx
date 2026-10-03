/**
 * Aba Dívidas (Fabrício, 24/08/2026) — cada sorteio que sai gera dívida pra
 * todo número não pago (fixo ou reserva). Aqui o dono vê o total por pessoa,
 * EDITA o valor de cada dívida, marca como paga ou exclui.
 *
 * Arena (2026-09-12): total devido num cartão rosa no topo, quem deve em
 * cartões no celular e tabela no desktop (nunca tabela abaixo de 1024px).
 */

import { Check, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseMoedaBR } from "@/lib/moeda";
import { atualizarDivida, excluirDivida, listarDividas } from "../dados-rifas";
import { CarregandoCentro, EstadoVazio, Selo } from "../componentes/basicos";
import { Botao } from "../componentes/botao";
import { Campo } from "../componentes/campo";
import { ModalConfirmar } from "../componentes/modal-confirmar";
import { fmtBRL } from "../formato";
import type { DividaRifa } from "../tipos";

/** O que o modal de confirmação precisa saber pra perguntar e executar. */
type PedidoConfirmacao = {
  titulo: string;
  mensagem: string;
  textoConfirmar: string;
  variante: "primario" | "perigo" | "sucesso";
  acao: () => Promise<void>;
};

export interface AbaDividasProps {
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

// Mesma pessoa em TODAS as rifas: telefone (só dígitos) manda; sem telefone,
// nome normalizado — "João" com e sem fone em rifas diferentes soma junto.
const chavePessoa = (d: DividaRifa) => {
  const fone = (d.phone ?? "").replace(/\D/g, "");
  return fone || d.nome.trim().toLowerCase();
};

const fmtDataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export const AbaDividas = ({ aoNotificar }: AbaDividasProps) => {
  const [dividas, setDividas] = useState<DividaRifa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarPagas, setMostrarPagas] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  const [confirmacao, setConfirmacao] = useState<PedidoConfirmacao | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [editandoGrupo, setEditandoGrupo] = useState<string | null>(null);
  const [valorGrupo, setValorGrupo] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDividas(await listarDividas());
    } catch (e) {
      aoNotificar(`Falha ao carregar dívidas: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setCarregando(false);
    }
  }, [aoNotificar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = useMemo(
    () => dividas.filter((d) => (mostrarPagas ? true : !d.pago)),
    [dividas, mostrarPagas],
  );

  // Agrupa por pessoa (phone quando existe; senão nome) com total em aberto.
  const grupos = useMemo(() => {
    const mapa = new Map<string, { nome: string; phone: string | null; itens: DividaRifa[]; totalAberto: number }>();
    for (const d of visiveis) {
      const k = chavePessoa(d);
      const g = mapa.get(k) ?? { nome: d.nome, phone: d.phone, itens: [], totalAberto: 0 };
      g.itens.push(d);
      if (!d.pago) g.totalAberto += d.valor_centavos;
      mapa.set(k, g);
    }
    return [...mapa.values()].sort((a, b) => b.totalAberto - a.totalAberto);
  }, [visiveis]);

  const totalGeral = useMemo(
    () => dividas.filter((d) => !d.pago).reduce((s, d) => s + d.valor_centavos, 0),
    [dividas],
  );

  const salvarValor = async (d: DividaRifa) => {
    const n = parseMoedaBR(valorEdicao);
    if (!Number.isFinite(n) || n < 0) {
      aoNotificar("Valor inválido.", "error");
      return;
    }
    try {
      await atualizarDivida(d.id, { valor_centavos: Math.round(n * 100) });
      setEditandoId(null);
      await carregar();
      aoNotificar("Valor da dívida atualizado.", "success");
    } catch (e) {
      aoNotificar(`Falha ao atualizar: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  /**
   * Um valor pra TODOS os números fixos da pessoa de uma vez (pedido do Fabrício, 08/09 22:58).
   * Ele cobra o mesmo por número fixo, e cada sorteio gera uma dívida por número — quem tem 12
   * fixos tinha que editar 12 vezes. Mexe só nas dívidas de origem `fixo` que ainda estão em
   * aberto: reserva tem valor próprio (o que o comprador reservou) e quitada não se remexe.
   */
  const salvarValorDosFixos = async (itens: DividaRifa[]) => {
    const n = parseMoedaBR(valorGrupo);
    if (!Number.isFinite(n) || n < 0) {
      aoNotificar("Valor inválido.", "error");
      return;
    }
    const alvos = itens.filter((d) => d.origem === "fixo" && !d.pago);
    if (alvos.length === 0) {
      aoNotificar("Essa pessoa não tem número fixo em aberto.", "info");
      setEditandoGrupo(null);
      return;
    }
    try {
      const centavos = Math.round(n * 100);
      await Promise.all(alvos.map((d) => atualizarDivida(d.id, { valor_centavos: centavos })));
      setEditandoGrupo(null);
      await carregar();
      aoNotificar(`${alvos.length} número(s) fixo(s) agora valem ${fmtBRL(centavos)} cada.`, "success");
    } catch (e) {
      aoNotificar(`Falha ao atualizar: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  const marcarPaga = async (d: DividaRifa, pago: boolean) => {
    try {
      await atualizarDivida(d.id, { pago });
      await carregar();
      aoNotificar(pago ? "Dívida quitada." : "Dívida reaberta.", "success");
    } catch (e) {
      aoNotificar(`Falha: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  // Confirmação pelo modal do app, não pelo `window.confirm` do navegador
  // (Δ 2026-09-08; o ModalConfirmar existe desde 21/08 justamente pra isso).
  const quitarTudo = (itens: DividaRifa[]) => {
    const abertas = itens.filter((d) => !d.pago);
    if (abertas.length === 0) return;
    setConfirmacao({
      titulo: "Quitar tudo desta pessoa?",
      mensagem: `As ${abertas.length} dívidas em aberto vão ficar marcadas como pagas. Dá pra reabrir uma a uma depois.`,
      textoConfirmar: "Quitar tudo",
      variante: "sucesso",
      acao: async () => {
        await Promise.all(abertas.map((d) => atualizarDivida(d.id, { pago: true })));
        await carregar();
        aoNotificar(`${abertas.length} dívidas quitadas.`, "success");
      },
    });
  };

  const excluir = (d: DividaRifa) => {
    setConfirmacao({
      titulo: "Excluir esta dívida?",
      mensagem: `A dívida do número #${d.numero} de ${d.nome} some de vez — isso não dá pra desfazer. Se a pessoa pagou, o certo é marcar como quitada.`,
      textoConfirmar: "Excluir",
      variante: "perigo",
      acao: async () => {
        await excluirDivida(d.id);
        await carregar();
        aoNotificar("Dívida excluída.", "success");
      },
    });
  };

  const confirmar = async () => {
    if (!confirmacao) return;
    setConfirmando(true);
    try {
      await confirmacao.acao();
      setConfirmacao(null);
    } catch (e) {
      aoNotificar(`Falha: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setConfirmando(false);
    }
  };

  // ── Pedaços compartilhados entre o cartão (celular) e a linha da tabela (desktop) ──

  const abrirEdicao = (d: DividaRifa) => {
    setEditandoId(d.id);
    setValorEdicao((d.valor_centavos / 100).toFixed(2).replace(".", ","));
  };

  const valorDe = (d: DividaRifa) =>
    editandoId === d.id ? (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-28">
          <Campo
            autoFocus
            value={valorEdicao}
            onChange={(e) => setValorEdicao(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void salvarValor(d)}
            placeholder="0,00"
            className="text-right"
            aria-label={`Valor da dívida do número ${d.numero}`}
          />
        </div>
        <Botao tamanho="sm" variante="sucesso" onClick={() => void salvarValor(d)}>
          Salvar
        </Botao>
        <Botao tamanho="sm" variante="fantasma" onClick={() => setEditandoId(null)}>
          Cancelar
        </Botao>
      </div>
    ) : (
      <button
        type="button"
        title="Editar valor da dívida"
        onClick={() => abrirEdicao(d)}
        className={`ar-num font-bold inline-flex items-center gap-1.5 ${d.pago ? "ar-txt-4 line-through" : "ar-txt-1"}`}
      >
        {fmtBRL(d.valor_centavos)}
        <Pencil size={13} className="ar-txt-3" />
      </button>
    );

  const acoesDe = (d: DividaRifa) => (
    <>
      {d.pago ? (
        <Botao tamanho="sm" variante="fantasma" onClick={() => void marcarPaga(d, false)}>
          Reabrir
        </Botao>
      ) : (
        <Botao tamanho="sm" variante="sucesso" onClick={() => void marcarPaga(d, true)}>
          <Check size={15} /> Quitar
        </Botao>
      )}
      <Botao tamanho="sm" variante="perigo" onClick={() => excluir(d)}>
        <Trash2 size={15} /> Excluir
      </Botao>
    </>
  );

  const seloOrigem = (d: DividaRifa) => (
    <Selo variante={d.origem === "fixo" ? "alerta" : "info"}>{d.origem === "fixo" ? "fixo" : "reserva"}</Selo>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="ar-titulo-tela">Dívidas</h2>
          <p className="text-sm ar-txt-3 mt-1">Números não pagos quando o sorteio saiu — fixos e reservas.</p>
        </div>
        <label className="flex items-center gap-2.5 text-sm ar-txt-2 cursor-pointer select-none min-h-[44px]">
          <input
            type="checkbox"
            className="w-5 h-5 accent-[var(--ar-roxo)]"
            checked={mostrarPagas}
            onChange={(e) => setMostrarPagas(e.target.checked)}
          />
          Mostrar quitadas
        </label>
      </div>

      {/* Total devido: o número que o Fabrício quer ver primeiro. */}
      <div className="ar-cartao ar-cartao--rosa">
        <p className="ar-rotulo" style={{ color: "var(--ar-roxo-tinta)", opacity: 0.75 }}>
          Total em aberto
        </p>
        <p className="ar-valor mt-2" style={{ color: "var(--ar-roxo-tinta)" }}>
          {fmtBRL(totalGeral)}
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--ar-roxo-tinta)", opacity: 0.8 }}>
          {grupos.filter((g) => g.totalAberto > 0).length} pessoa(s) devendo ·{" "}
          {dividas.filter((d) => !d.pago).length} número(s)
        </p>
      </div>

      {carregando ? (
        <CarregandoCentro rotulo="Carregando dívidas…" />
      ) : grupos.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden>🎉</span>}
          titulo={`Nenhuma dívida ${mostrarPagas ? "registrada" : "em aberto"}`}
          descricao="Quando um sorteio sai, todo número não pago (fixo ou reserva) cai aqui pra você cobrar."
        />
      ) : (
        grupos.map((g) => {
          const chave = g.phone || g.nome;
          const fone = String(g.phone ?? "").replace(/\D/g, "");
          return (
            <div key={chave} className="ar-cartao space-y-4">
              {/* Cabeçalho da pessoa */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium ar-txt-1 leading-tight truncate">{g.nome}</p>
                  {g.phone && <p className="ar-num text-sm ar-txt-3 mt-0.5">{g.phone}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="ar-rotulo">{g.totalAberto > 0 ? "deve" : "situação"}</p>
                  <p
                    className="ar-num font-bold text-[var(--ar-t-md)] leading-tight mt-0.5"
                    style={{ color: g.totalAberto > 0 ? "var(--ar-rosa-alto)" : "var(--ar-ok)" }}
                  >
                    {g.totalAberto > 0 ? fmtBRL(g.totalAberto) : "quitado"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {fone && (
                  <a
                    href={`https://wa.me/${fone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-[var(--ar-r-lg)] text-sm font-medium"
                    style={{ background: "var(--ar-ok-vidro)", color: "var(--ar-ok)" }}
                  >
                    <MessageCircle size={15} /> Cobrar
                  </a>
                )}
                {/* Um valor pra todos os fixos da pessoa — o Fabrício cobra o mesmo por número
                    fixo e estava editando um por um (pedido 08/09 22:58). */}
                {g.itens.some((d) => d.origem === "fixo" && !d.pago) &&
                  (editandoGrupo === chave ? (
                    <>
                      <div className="w-28">
                        <Campo
                          autoFocus
                          value={valorGrupo}
                          onChange={(e) => setValorGrupo(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && void salvarValorDosFixos(g.itens)}
                          placeholder="0,00"
                          className="text-right"
                          aria-label={`Valor dos números fixos de ${g.nome}`}
                        />
                      </div>
                      <Botao tamanho="sm" variante="primario" onClick={() => void salvarValorDosFixos(g.itens)}>
                        Aplicar a todos
                      </Botao>
                      <Botao tamanho="sm" variante="fantasma" onClick={() => setEditandoGrupo(null)}>
                        Cancelar
                      </Botao>
                    </>
                  ) : (
                    <Botao
                      tamanho="sm"
                      variante="contorno"
                      title="Define o mesmo valor para todos os números fixos em aberto desta pessoa"
                      onClick={() => {
                        setEditandoGrupo(chave);
                        const primeiro = g.itens.find((d) => d.origem === "fixo" && !d.pago);
                        setValorGrupo(((primeiro?.valor_centavos ?? 0) / 100).toFixed(2).replace(".", ","));
                      }}
                    >
                      <Pencil size={15} /> Valor dos fixos
                    </Botao>
                  ))}
                {g.totalAberto > 0 && (
                  <Botao tamanho="sm" variante="sucesso" onClick={() => quitarTudo(g.itens)}>
                    <Check size={15} /> Quitar tudo
                  </Botao>
                )}
              </div>

              {/* Celular e tablet: um cartão por número */}
              <div className="ar-cartoes-linha">
                {g.itens.map((d) => (
                  <div key={d.id} className="ar-cartao ar-cartao--alto ar-cartao--compacto">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="ar-num font-bold ar-txt-1">#{d.numero}</span>
                      {seloOrigem(d)}
                      {d.pago && <Selo variante="sucesso">quitada</Selo>}
                      <span className="text-xs ar-txt-4 ml-auto">{fmtDataCurta(d.sorteio_em)}</span>
                    </div>
                    <div className="mt-3">{valorDe(d)}</div>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">{acoesDe(d)}</div>
                  </div>
                ))}
              </div>

              {/* Desktop: tabela */}
              <div className="ar-tabela-envelope">
                <table className="ar-tabela">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Número</th>
                      <th style={{ width: 120 }}>Origem</th>
                      <th style={{ width: 120 }}>Sorteio</th>
                      <th>Valor</th>
                      <th style={{ width: 240 }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.itens.map((d) => (
                      <tr key={d.id}>
                        <td className="ar-num font-bold ar-txt-1">#{d.numero}</td>
                        <td>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {seloOrigem(d)}
                            {d.pago && <Selo variante="sucesso">quitada</Selo>}
                          </div>
                        </td>
                        <td className="text-sm ar-txt-3 whitespace-nowrap">{fmtDataCurta(d.sorteio_em)}</td>
                        <td>{valorDe(d)}</td>
                        <td>
                          <div className="flex items-center gap-2 flex-wrap">{acoesDe(d)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      <ModalConfirmar
        aberto={!!confirmacao}
        titulo={confirmacao?.titulo ?? ""}
        mensagem={confirmacao?.mensagem ?? ""}
        textoConfirmar={confirmacao?.textoConfirmar}
        variante={confirmacao?.variante}
        carregando={confirmando}
        aoConfirmar={() => void confirmar()}
        aoCancelar={() => setConfirmacao(null)}
      />
    </div>
  );
};
