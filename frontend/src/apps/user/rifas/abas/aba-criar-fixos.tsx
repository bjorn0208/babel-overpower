/**
 * Editor de NÚMEROS FIXOS do wizard (Fabrício, 24/08/2026 · fluxo em linhas
 * 26/08: ao FIXAR um número, uma nova linha em branco surge logo abaixo pra
 * emendar o próximo — cadastro em sequência, sem cliques extras).
 * Fixos valem POR TIPO DE SORTEIO: toda rifa ativa daquele tipo reserva esses
 * números pra pessoa fixada, sem prazo de expiração — e no sorteio, fixo não
 * pago vira dívida. Por isso a rifa "tem que ser sempre do mesmo tipo":
 * mudar o tipo com fixos cadastrados fica bloqueado no wizard.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pin, Plus, X } from "lucide-react";
import { Botao } from "../componentes/botao";
import { Campo } from "../componentes/campo";
import {
  adicionarNumerosFixos,
  aprovarNumeroFixo,
  listarDividas,
  listarNumerosFixos,
  removerNumeroFixo,
  rifasAtivasDoTipo,
  sincronizarFixosNaRifa,
} from "../dados-rifas";
import { urlRifa } from "@/lib/url-app";
import { fmtBRL } from "../formato";
import type { DividaRifa, MetodoSorteio, NumeroFixoRifa } from "../tipos";
import "./aba-criar.css";

export interface EditorNumerosFixosProps {
  metodo: MetodoSorteio;
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
  aoMudarQtd?: (qtd: number) => void;
}

interface LinhaRascunho {
  chave: number;
  numero: string;
  nome: string;
  phone: string;
}

interface GrupoContato {
  nome: string;
  phone: string | null;
  itens: NumeroFixoRifa[];
}

let proximaChave = 1;
const linhaVazia = (): LinhaRascunho => ({ chave: proximaChave++, numero: "", nome: "", phone: "" });

/** Erros do Supabase (PostgREST/RLS) chegam como objeto plano `{message, details,
 *  hint, code}`, não como `Error` — `e instanceof Error` é false pra eles e o
 *  catch acabava mostrando "[object Object]" pro dono em vez do motivo real. */
function mensagemDeErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** "7, 13 22;31" → [7, 13, 22, 31] — sem repetidos, só inteiros ≥ 0. */
function lerNumeros(texto: string): number[] {
  return [...new Set(
    texto.split(/[\s,;]+/).map((x) => Number.parseInt(x, 10)).filter((x) => Number.isFinite(x) && x >= 0),
  )];
}

export const EditorNumerosFixos = ({ metodo, aoNotificar, aoMudarQtd }: EditorNumerosFixosProps) => {
  const [fixos, setFixos] = useState<NumeroFixoRifa[]>([]);
  const [dividas, setDividas] = useState<DividaRifa[]>([]);
  const [linhas, setLinhas] = useState<LinhaRascunho[]>([linhaVazia()]);
  const [ocupado, setOcupado] = useState(false);
  // Campo "+ números" de cada cartão, pela chave do contato.
  const [maisNumeros, setMaisNumeros] = useState<Record<string, string>>({});
  const refUltimoNumero = useRef<HTMLInputElement | null>(null);

  // `fixos` guarda TUDO que está na tabela; a tela separa os dois estados.
  // Pendente é pedido que o cliente fez pela conversa (`solicitar_numero_fixo_rifa`)
  // e ainda não reserva número nenhum — misturar os dois faria o dono achar que o
  // número já está amarrado quando ele nem olhou o pedido.
  const ativos = fixos.filter((f) => (f.status ?? "ativo") === "ativo");
  const pendentes = fixos.filter((f) => f.status === "pendente");

  const carregar = useCallback(async () => {
    try {
      const lista = await listarNumerosFixos(metodo);
      setFixos(lista);
      aoMudarQtd?.(lista.filter((f) => (f.status ?? "ativo") === "ativo").length);
      // acumulado por pessoa (todas as rifas — fixos e reservas dela)
      try { setDividas((await listarDividas()).filter((d) => !d.pago)); } catch { setDividas([]); }
    } catch {
      // tabela pode não existir em ambiente antigo — seção fica vazia
      setFixos([]);
      aoMudarQtd?.(0);
    }
  }, [metodo, aoMudarQtd]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Fixo mudou → rifas ATIVAS do mesmo tipo reservam/liberam na hora.
  // `nomeParaLink`: quando informado, procura o pedido novo criado pra essa
  // pessoa entre as rifas sincronizadas e já copia o link de acompanhamento
  // (sem isso, o dono tinha que caçar o link manualmente em Pedidos).
  const sincronizarAtivas = async (nomeParaLink?: string) => {
    try {
      const ids = await rifasAtivasDoTipo(metodo);
      const resultados = await Promise.all(ids.map((id) => sincronizarFixosNaRifa(id)));
      if (!nomeParaLink) return;
      const alvo = nomeParaLink.trim().toLowerCase();
      const links = resultados
        .filter((r) => r.rifa_chave_publica)
        .flatMap((r) => (r.pedidos_novos ?? []).map((p) => ({ ...p, rifaChave: r.rifa_chave_publica! })))
        .filter((p) => p.nome.trim().toLowerCase() === alvo);
      if (links.length === 1) {
        const url = `${urlRifa(links[0].rifaChave)}?pedido=${links[0].pedido_chave_publica}`;
        void navigator.clipboard?.writeText(url).then(
          () => aoNotificar(`Link copiado pra ${nomeParaLink.trim()}: ${url}`, "success"),
          () => aoNotificar(`Link pra ${nomeParaLink.trim()}: ${url}`, "info"),
        );
      } else if (links.length > 1) {
        aoNotificar(`${links.length} links gerados pra ${nomeParaLink.trim()} (${links.length} rifas ativas) — veja em Pedidos.`, "success");
      }
    } catch {
      // sem rifa ativa (ou RPC indisponível) — o trigger de ativação cobre depois
    }
  };

  const editarLinha = (chave: number, campo: "numero" | "nome" | "phone", valor: string) => {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  };

  const fixarLinha = async (linha: LinhaRascunho) => {
    // Mais de um número por contato (Dominic 26/08): "7, 13, 22"
    const nums = lerNumeros(linha.numero);
    if (nums.length === 0) {
      aoNotificar("Informe os números — ex: 7, 13, 22", "error");
      return;
    }
    if (!linha.nome.trim()) {
      aoNotificar("Informe o nome de quem fica com os números.", "error");
      return;
    }
    setOcupado(true);
    try {
      await adicionarNumerosFixos(metodo, nums, linha.nome.trim(), linha.phone.replace(/\D/g, "") || null);
      // Linha fixada some do rascunho e uma NOVA linha em branco garante o
      // "adicionar mais um" logo abaixo (pedido Dominic 26/08).
      setLinhas((ls) => {
        const resto = ls.filter((l) => l.chave !== linha.chave);
        const temVazia = resto.some((l) => !l.numero && !l.nome && !l.phone);
        return temVazia ? resto : [...resto, linhaVazia()];
      });
      await carregar();
      await sincronizarAtivas(linha.nome.trim());
      aoNotificar(nums.length === 1
        ? `Número ${nums[0]} fixado — pode adicionar o próximo contato.`
        : `${nums.length} números fixados pra ${linha.nome.trim()} — pode adicionar o próximo contato.`, "success");
      setTimeout(() => refUltimoNumero.current?.focus(), 50);
    } catch (e) {
      const msg = mensagemDeErro(e);
      aoNotificar(msg.includes("duplicate") ? "Esse número já está fixado nesse tipo de sorteio." : `Falha ao fixar: ${msg}`, "error");
    } finally {
      setOcupado(false);
    }
  };

  // Mais números pra quem JÁ tem fixo (Fabrício 10/09): usa nome/telefone do
  // cartão em vez de redigitar — redigitado diferente virava outro cartão.
  // O upsert ignora em silêncio número já fixado, inclusive de OUTRA pessoa,
  // então separa antes pra não avisar "fixado" quando nada mudou.
  const adicionarAoContato = async (k: string, g: GrupoContato) => {
    const nums = lerNumeros(maisNumeros[k] ?? "");
    if (nums.length === 0) {
      aoNotificar("Informe os números — ex: 7, 13, 22", "error");
      return;
    }
    const fixoPorNumero = new Map(fixos.map((f) => [f.numero, f]));
    const deOutro = nums.filter((n) => fixoPorNumero.has(n) && !g.itens.some((f) => f.numero === n));
    if (deOutro.length > 0) {
      const rotulo = (n: number) => {
        const f = fixoPorNumero.get(n)!;
        return `${n} (${f.nome}${f.status === "pendente" ? ", pedido esperando você" : ""})`;
      };
      aoNotificar(`Já é de outra pessoa: ${deOutro.map(rotulo).join(", ")}.`, "error");
      return;
    }
    const novos = nums.filter((n) => !fixoPorNumero.has(n));
    if (novos.length === 0) {
      aoNotificar(`${g.nome} já tem ${nums.length === 1 ? "esse número" : "esses números"}.`, "info");
      return;
    }
    setOcupado(true);
    try {
      await adicionarNumerosFixos(metodo, novos, g.nome, g.phone);
      setMaisNumeros((m) => ({ ...m, [k]: "" }));
      await carregar();
      await sincronizarAtivas(g.nome);
      aoNotificar(novos.length === 1
        ? `Número ${novos[0]} fixado pra ${g.nome}.`
        : `${novos.length} números fixados pra ${g.nome}.`, "success");
    } catch (e) {
      aoNotificar(`Falha ao fixar: ${mensagemDeErro(e)}`, "error");
    } finally {
      setOcupado(false);
    }
  };

  const aprovar = async (f: NumeroFixoRifa) => {
    setOcupado(true);
    try {
      await aprovarNumeroFixo(f.id);
      await carregar();
      await sincronizarAtivas(f.nome);
      aoNotificar(`Número ${f.numero} agora é fixo de ${f.nome} — vale em toda rifa deste sorteio.`, "success");
    } catch (e) {
      aoNotificar(`Falha ao aprovar: ${mensagemDeErro(e)}`, "error");
    } finally {
      setOcupado(false);
    }
  };

  const recusar = async (f: NumeroFixoRifa) => {
    setOcupado(true);
    try {
      await removerNumeroFixo(f.id);
      await carregar();
      aoNotificar(`Pedido de ${f.nome} pro número ${f.numero} recusado — o número segue à venda.`, "info");
    } catch (e) {
      aoNotificar(`Falha ao recusar: ${mensagemDeErro(e)}`, "error");
    } finally {
      setOcupado(false);
    }
  };

  const remover = async (f: NumeroFixoRifa) => {
    setOcupado(true);
    try {
      await removerNumeroFixo(f.id);
      await carregar();
      await sincronizarAtivas();
      aoNotificar(`Número ${f.numero} liberado.`, "success");
    } catch (e) {
      aoNotificar(`Falha ao remover: ${mensagemDeErro(e)}`, "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="ar-cartao">
      <div className="ar-secao-cab">
        <span className="ar-secao-cab__icone">
          <Pin size={20} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="ar-titulo-secao">Números fixos deste tipo de sorteio</h3>
          <p className="text-sm ar-txt-3 mt-1">
            Ficam sempre reservados pra pessoa indicada em TODA rifa deste tipo, sem prazo. Se o sorteio sair e o
            número não estiver pago, o valor vira dívida da pessoa (aba Dívidas).
          </p>
        </div>
      </div>

      {pendentes.length > 0 && (
        <div className="flex flex-col gap-2 mt-4">
          <p className="text-sm font-medium ar-txt-1">
            {pendentes.length === 1 ? "1 pedido esperando você" : `${pendentes.length} pedidos esperando você`}
            <span className="ar-txt-3 font-normal"> — clientes pediram estes números pela conversa. Enquanto você não aprovar, eles seguem à venda.</span>
          </p>
          {pendentes.map((f) => (
            <div key={f.id} className="ar-cartao ar-cartao--alto ar-cartao--compacto flex items-center gap-2 flex-wrap">
              <span className="ar-fixo-chip ar-num">{f.numero}</span>
              <span className="flex-1 min-w-0 truncate ar-txt-1">{f.nome}</span>
              {f.phone && <span className="text-xs ar-txt-3 ar-num">{f.phone}</span>}
              <Botao type="button" variante="primario" tamanho="sm" disabled={ocupado} onClick={() => void aprovar(f)}>
                <Check size={16} aria-hidden />
                Aprovar
              </Botao>
              <Botao type="button" variante="contorno" tamanho="sm" disabled={ocupado} onClick={() => void recusar(f)}>
                <X size={16} aria-hidden />
                Recusar
              </Botao>
            </div>
          ))}
        </div>
      )}

      {ativos.length > 0 && (() => {
        // Um cartão por CONTATO: seus números + dívida ACUMULADA de todas as
        // rifas (reservada por ele ou fixada pelo dono) — pedido 26/08.
        const chaveDe = (nome: string, phone: string | null) =>
          (phone ?? "").replace(/\D/g, "") || nome.trim().toLowerCase();
        const devidoPor = new Map<string, number>();
        for (const d of dividas) {
          const k = chaveDe(d.nome, d.phone);
          devidoPor.set(k, (devidoPor.get(k) ?? 0) + d.valor_centavos);
        }
        const grupos = new Map<string, GrupoContato>();
        for (const f of ativos) {
          const k = chaveDe(f.nome, f.phone);
          const g = grupos.get(k) ?? { nome: f.nome, phone: f.phone, itens: [] };
          g.itens.push(f);
          grupos.set(k, g);
        }
        return (
          <div className="flex flex-col gap-2 mt-4">
            {[...grupos.entries()].map(([k, g]) => (
              <div key={k} className="ar-cartao ar-cartao--alto ar-cartao--compacto flex flex-col gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-0 font-medium ar-txt-1 truncate">{g.nome}</span>
                  {g.phone && <span className="text-xs ar-txt-3 ar-num">{g.phone}</span>}
                  {(devidoPor.get(k) ?? 0) > 0 && (
                    <span
                      className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                      style={{ background: "var(--ar-rosa-vidro)", color: "var(--ar-rosa-alto)" }}
                    >
                      deve {fmtBRL(devidoPor.get(k) ?? 0)} acumulado
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {g.itens.map((f) => (
                    <span key={f.id} className="ar-fixo-chip">
                      {f.numero}
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => void remover(f)}
                        title={`Tirar o número ${f.numero}`}
                        aria-label={`Tirar o número ${f.numero}`}
                        className="ar-fixo-chip__x"
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <Campo
                      type="text"
                      inputMode="numeric"
                      placeholder="+ números — ex: 31, 40"
                      aria-label={`Adicionar números pra ${g.nome}`}
                      className="ar-num"
                      value={maisNumeros[k] ?? ""}
                      onChange={(e) => setMaisNumeros((m) => ({ ...m, [k]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void adicionarAoContato(k, g); } }}
                    />
                  </div>
                  <Botao
                    type="button"
                    variante="secundario"
                    disabled={ocupado || !(maisNumeros[k] ?? "").trim()}
                    onClick={() => void adicionarAoContato(k, g)}
                  >
                    Adicionar
                  </Botao>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Linhas de cadastro: fixou → a linha vira cartão acima e uma nova
          linha em branco aparece aqui embaixo pro próximo número. */}
      <div className="flex flex-col gap-3 mt-4">
        {linhas.map((l, i) => (
          <div key={l.chave} className="ar-fixo-linha">
            <Campo
              ref={i === linhas.length - 1 ? refUltimoNumero : undefined}
              type="text"
              inputMode="numeric"
              placeholder="Nºs — ex: 7, 13, 22"
              aria-label="Números a fixar"
              className="ar-num"
              value={l.numero}
              onChange={(e) => editarLinha(l.chave, "numero", e.target.value)}
            />
            <Campo
              type="text"
              placeholder="Nome de quem fica com o número"
              aria-label="Nome de quem fica com o número"
              value={l.nome}
              onChange={(e) => editarLinha(l.chave, "nome", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void fixarLinha(l); } }}
            />
            <Campo
              type="tel"
              placeholder="WhatsApp (opcional)"
              aria-label="WhatsApp (opcional)"
              className="ar-num"
              value={l.phone}
              onChange={(e) => editarLinha(l.chave, "phone", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void fixarLinha(l); } }}
            />
            <Botao
              type="button"
              variante="primario"
              disabled={ocupado}
              onClick={() => void fixarLinha(l)}
              larguraTotal
            >
              Fixar
            </Botao>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Botao
          type="button"
          variante="contorno"
          tamanho="sm"
          onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}
        >
          <Plus size={16} aria-hidden />
          Adicionar mais um contato
        </Botao>
      </div>
    </section>
  );
};
