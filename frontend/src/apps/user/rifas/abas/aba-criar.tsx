/**
 * Wizard de criar/editar rifa — 4 passos (Informações · Prêmio · Números · Revisão),
 * mapeado 1:1 nas colunas reais da tabela `rifas`. Nova rifa nasce como rascunho.
 */

import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Gift,
  ImagePlus,
  ListChecks,
  Plus,
  Rocket,
  Save,
  Sparkles,
  Ticket,
  Trophy,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseMoedaBR } from "@/lib/moeda";
import { Botao } from "../componentes/botao";
import { AreaTexto, Campo, Selecao } from "../componentes/campo";
import { atualizarRifa, criarRifa, subirImagemPremio } from "../dados-rifas";
import {
  ROTULO_METODO_SORTEIO,
  contagemSorteio,
  ehVideo,
  fmtBRL,
  rotuloProximoSorteio,
} from "../formato";
import type { CargaRifa, MetodoSorteio, Rifa } from "../tipos";
import { EditorNumerosFixos } from "./aba-criar-fixos";
import {
  EditorCotas,
  EditorPromocoes,
  Passos,
  type CotaRascunho,
  type PromocaoRascunho,
} from "./aba-criar-listas";
import { PassoRevisao } from "./aba-criar-revisao";
import "./aba-criar.css";

export interface AbaCriarProps {
  rifaEmEdicao: Rifa | null;
  aoSalvar: (rifa: { id?: string }) => void;
  aoCancelar: () => void;
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

const centavosPraReais = (c: number | null | undefined): string =>
  c == null ? "" : (Number(c) / 100).toFixed(2).replace(".", ",");

const reaisPraCentavos = (s: string): number | null => {
  const n = parseMoedaBR(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** Cabeçalho de seção: ícone lucide + título + linha de apoio. */
const CabecalhoSecao = ({
  icone,
  titulo,
  apoio,
}: {
  icone: ReactNode;
  titulo: string;
  apoio: string;
}) => (
  <div className="ar-secao-cab">
    <span className="ar-secao-cab__icone">{icone}</span>
    <div className="min-w-0">
      <h2 className="ar-titulo-secao">{titulo}</h2>
      <p className="text-sm ar-txt-3 mt-1">{apoio}</p>
    </div>
  </div>
);

/** Área tracejada de escolher arquivo — o input fica escondido só visualmente. */
const AreaUpload = ({
  rotulo,
  apoio,
  accept,
  desabilitado,
  aoEscolher,
}: {
  rotulo: string;
  apoio: string;
  accept: string;
  desabilitado?: boolean;
  aoEscolher: (arquivo: File | undefined) => void;
}) => (
  <label className={`ar-upload ${desabilitado ? "ar-upload--travado" : ""}`}>
    <span className="ar-upload__icone">
      <ImagePlus size={20} aria-hidden />
    </span>
    <span className="min-w-0">
      <span className="block text-base ar-txt-1 font-medium">{rotulo}</span>
      <span className="block text-sm ar-txt-3 mt-0.5">{apoio}</span>
    </span>
    <input
      type="file"
      className="ar-upload__entrada"
      accept={accept}
      disabled={desabilitado}
      onChange={(e) => aoEscolher(e.target.files?.[0])}
    />
  </label>
);

export const AbaCriar = ({ rifaEmEdicao, aoSalvar, aoCancelar, aoNotificar }: AbaCriarProps) => {
  const editando = Boolean(rifaEmEdicao?.id);
  const [passo, setPasso] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  const [titulo, setTitulo] = useState(rifaEmEdicao?.titulo ?? "");
  const [descricao, setDescricao] = useState(rifaEmEdicao?.descricao ?? "");
  const [imagemUrl, setImagemUrl] = useState(rifaEmEdicao?.imagem_url ?? "");
  const [galeria, setGaleria] = useState<string[]>(rifaEmEdicao?.galeria_urls ?? []);
  const [premio, setPremio] = useState(rifaEmEdicao?.premio_principal ?? "");
  const [cotas, setCotas] = useState<CotaRascunho[]>(
    (rifaEmEdicao?.cotas_premiadas ?? []).map((c) => ({
      ...c,
      numero: String(c.numero),
      premio: c.premio,
    })),
  );
  const [totalNumeros, setTotalNumeros] = useState(String(rifaEmEdicao?.total_numeros ?? 100));
  const [precoReais, setPrecoReais] = useState(
    centavosPraReais(rifaEmEdicao?.preco_numero_centavos ?? 500),
  );
  const [promocoes, setPromocoes] = useState<PromocaoRascunho[]>(
    (rifaEmEdicao?.promocoes ?? []).map((p) => ({
      qtd: String(p.qtd),
      precoReais: centavosPraReais(p.preco_total_centavos),
    })),
  );
  const [metodo, setMetodo] = useState<MetodoSorteio>(
    rifaEmEdicao?.metodo_sorteio ?? "loteria_federal",
  );
  // Mais prêmios (2º, 3º...) — de volta a pedido do Fabrício (25/08); o
  // sortear_rifa da produção já sorteia um número por prêmio.
  const [premiosExtras, setPremiosExtras] = useState<string[]>(rifaEmEdicao?.premios_extras ?? []);
  // Fixos travam o tipo de sorteio: número fixo vale pra TODA rifa do tipo.
  const [qtdFixos, setQtdFixos] = useState(0);
  const [dataPrevista, setDataPrevista] = useState(rifaEmEdicao?.data_sorteio_prevista ?? "");
  const [maxPorPedido, setMaxPorPedido] = useState(
    String(rifaEmEdicao?.max_numeros_por_pedido ?? 100),
  );
  const [minutosReserva, setMinutosReserva] = useState(String(rifaEmEdicao?.minutos_reserva ?? 30));

  // Botão de teste (Theus vai remover depois): preenche o wizard inteiro via
  // IA (edge gerar-rifa-ia) — dados fictícios pra não precisar digitar tudo
  // toda vez que testa o fluxo de criação.
  const [gerandoIa, setGerandoIa] = useState(false);
  const METODOS_VALIDOS = new Set<MetodoSorteio>([
    "loteria_federal",
    "plataforma",
    "ppt",
    "ptm",
    "pt_rio",
    "ptv",
    "ptn",
    "corujinha",
  ]);
  const preencherComIa = async () => {
    setGerandoIa(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerar-rifa-ia", { body: {} });
      if (error) throw error;
      const r = data as { ok?: boolean; erro?: string; rascunho?: Record<string, unknown> };
      if (!r?.ok || !r.rascunho) throw new Error(r?.erro ?? "resposta inválida");
      const d = r.rascunho;
      if (typeof d.titulo === "string") setTitulo(d.titulo);
      if (typeof d.descricao === "string") setDescricao(d.descricao);
      if (typeof d.premio_principal === "string") setPremio(d.premio_principal);
      if (Array.isArray(d.premios_extras))
        setPremiosExtras(d.premios_extras.filter((p): p is string => typeof p === "string"));
      if (typeof d.total_numeros === "number") setTotalNumeros(String(d.total_numeros));
      if (typeof d.preco_numero_centavos === "number")
        setPrecoReais(centavosPraReais(d.preco_numero_centavos));
      if (Array.isArray(d.promocoes)) {
        setPromocoes(
          d.promocoes
            .filter(
              (p): p is { qtd: number; preco_total_centavos: number } =>
                typeof p === "object" &&
                p !== null &&
                typeof (p as Record<string, unknown>).qtd === "number",
            )
            .map((p) => ({
              qtd: String(p.qtd),
              precoReais: centavosPraReais(p.preco_total_centavos),
            })),
        );
      }
      if (
        typeof d.metodo_sorteio === "string" &&
        METODOS_VALIDOS.has(d.metodo_sorteio as MetodoSorteio)
      ) {
        setMetodo(d.metodo_sorteio as MetodoSorteio);
      }
      if (typeof d.dias_ate_sorteio === "number") {
        const data2 = new Date(Date.now() + d.dias_ate_sorteio * 86_400_000);
        setDataPrevista(data2.toISOString().slice(0, 10));
      }
      if (typeof d.max_numeros_por_pedido === "number")
        setMaxPorPedido(String(d.max_numeros_por_pedido));
      if (typeof d.minutos_reserva === "number") setMinutosReserva(String(d.minutos_reserva));
      aoNotificar("Preenchido com IA — revise antes de salvar.", "success");
    } catch (e) {
      aoNotificar(`Falha ao gerar com IA: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setGerandoIa(false);
    }
  };

  const subirImagem = async (arquivo: File | undefined, destino: "capa" | "galeria") => {
    if (!arquivo) return;
    if (destino === "galeria" && galeria.length >= 8) {
      aoNotificar("A galeria aceita no máximo 8 itens.", "error");
      return;
    }
    setSubindo(true);
    try {
      const url = await subirImagemPremio(arquivo);
      if (destino === "capa") setImagemUrl(url);
      else setGaleria((g) => [...g, url]);
      aoNotificar("Imagem enviada.", "success");
    } catch (e) {
      aoNotificar(`Falha no envio: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSubindo(false);
    }
  };

  const validarPasso = (p: number): boolean => {
    const novos: Record<string, string> = {};
    if (p === 1 && !titulo.trim()) novos.titulo = "Campo obrigatório";
    if (p === 2 && !premio.trim()) novos.premio = "Campo obrigatório";
    if (p === 3) {
      const total = Number.parseInt(totalNumeros, 10);
      if (!total || total < 1 || total > 100_000) novos.totalNumeros = "Entre 1 e 100.000";
      const cent = reaisPraCentavos(precoReais);
      if (!cent || cent < 1) novos.precoReais = "Preço inválido";
    }
    setErros(novos);
    return Object.keys(novos).length === 0;
  };

  const avancar = () => {
    if (!validarPasso(passo)) return;
    setPasso((s) => Math.min(4, s + 1));
  };

  // Numeração da rifa nova segue o método de sorteio (decisão Theus 26/08):
  // loteria (federal, PPT…) = desde zero (00–99 numa rifa de 100, casa com a
  // dezena do resultado); sorteio pela plataforma = 1..total (01 a 100).
  // Em edição preserva o flag da rifa — mudar depois de vender deslocaria os
  // números já pagos.
  const desdeZero = editando
    ? Boolean(rifaEmEdicao?.numeracao_desde_zero)
    : metodo !== "plataforma";

  const montarCarga = (): CargaRifa => ({
    titulo: titulo.trim(),
    descricao: descricao.trim() || null,
    imagem_url: imagemUrl || null,
    galeria_urls: galeria,
    premio_principal: premio.trim(),
    total_numeros: Number.parseInt(totalNumeros, 10),
    preco_numero_centavos: reaisPraCentavos(precoReais) ?? 0,
    promocoes: promocoes
      .map((p) => ({
        qtd: Number.parseInt(p.qtd, 10),
        preco_total_centavos: reaisPraCentavos(p.precoReais) ?? 0,
      }))
      .filter((p) => p.qtd > 0 && p.preco_total_centavos > 0),
    numeracao_desde_zero: desdeZero,
    cotas_premiadas: cotas
      .map((c) => ({ ...c, numero: Number.parseInt(c.numero, 10) }))
      .filter((c) => {
        const min = desdeZero ? 0 : 1;
        return (
          c.numero >= min &&
          c.numero <= min + Number.parseInt(totalNumeros, 10) - 1 &&
          c.premio.trim()
        );
      })
      .map((c) => ({
        numero: c.numero,
        premio: c.premio.trim(),
        pedido_ganhador: c.pedido_ganhador ?? null,
        ganhador_nome: c.ganhador_nome ?? null,
      })),
    data_sorteio_prevista: dataPrevista || null,
    metodo_sorteio: metodo,
    premios_extras: premiosExtras.map((p) => p.trim()).filter(Boolean),
    minutos_reserva: Math.min(1440, Math.max(5, Number.parseInt(minutosReserva, 10) || 30)),
    max_numeros_por_pedido: Math.min(1000, Math.max(1, Number.parseInt(maxPorPedido, 10) || 100)),
  });

  const salvar = async () => {
    if (!validarPasso(1) || !validarPasso(2) || !validarPasso(3)) {
      aoNotificar("Tem campo obrigatório pendente — revisa os passos.", "error");
      return;
    }
    setSalvando(true);
    try {
      const carga = montarCarga();
      if (editando && rifaEmEdicao) {
        const { total_numeros: _ignorado, ...semTotal } = carga;
        await atualizarRifa(rifaEmEdicao.id, semTotal);
        aoNotificar("Rifa atualizada.", "success");
        aoSalvar({ id: rifaEmEdicao.id });
      } else {
        const nova = await criarRifa(carga);
        aoNotificar("Rifa criada como rascunho. Ative quando estiver pronta.", "success");
        aoSalvar({ id: nova.id });
      }
    } catch (e) {
      aoNotificar(`Falha ao salvar: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSalvando(false);
    }
  };

  const total = Number.parseInt(totalNumeros, 10) || 0;
  const cent = reaisPraCentavos(precoReais) ?? 0;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <h1 className="ar-titulo-tela">{editando ? "Editar rifa" : "Criar rifa"}</h1>
        <Botao
          type="button"
          tamanho="sm"
          variante="fantasma"
          carregando={gerandoIa}
          onClick={() => void preencherComIa()}
        >
          <Sparkles size={16} aria-hidden />
          Preencher com IA (teste)
        </Botao>
      </div>

      <Passos atual={passo} />

      {/* Passo 1 — Informações */}
      {passo === 1 && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <section className="ar-cartao">
            <CabecalhoSecao
              icone={<ListChecks size={20} aria-hidden />}
              titulo="Informações da rifa"
              apoio="O básico que aparece no link público."
            />
            <div className="ar-form-grid mt-5">
              <div className="ar-col-toda">
                <Campo
                  rotulo="Título *"
                  placeholder="Ex.: Rifa do iPhone 16"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  erro={erros.titulo}
                />
              </div>
              <div className="ar-col-toda">
                <AreaTexto
                  rotulo="Descrição"
                  placeholder="Regras, data prevista, como será o sorteio…"
                  value={descricao ?? ""}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="ar-cartao">
            <CabecalhoSecao
              icone={<ImagePlus size={20} aria-hidden />}
              titulo="Fotos e vídeos"
              apoio="A capa é o que o comprador vê primeiro. A galeria aceita até 8 itens."
            />

            <div className="mt-5">
              <p className="ar-rotulo mb-1.5">Foto de capa do prêmio</p>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <AreaUpload
                    rotulo={imagemUrl ? "Trocar a capa" : "Escolher a foto de capa"}
                    apoio={subindo ? "Enviando…" : "JPG, PNG ou WebP"}
                    accept="image/*"
                    desabilitado={subindo}
                    aoEscolher={(a) => void subirImagem(a, "capa")}
                  />
                </div>
                {imagemUrl && (
                  <div className="ar-mini">
                    <img src={imagemUrl} alt="capa do prêmio" />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5">
              <p className="ar-rotulo mb-1.5">Galeria — até 8 itens (fotos e vídeos)</p>
              <AreaUpload
                rotulo={galeria.length >= 8 ? "Galeria cheia (8 itens)" : "Adicionar à galeria"}
                apoio={
                  subindo
                    ? "Enviando…"
                    : `${galeria.length} de 8 · imagens, MP4, WebM ou MOV`
                }
                accept="image/*,video/mp4,video/webm,video/quicktime"
                desabilitado={subindo || galeria.length >= 8}
                aoEscolher={(a) => void subirImagem(a, "galeria")}
              />
              {galeria.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {galeria.map((g, i) => (
                    <div key={g} className="ar-mini">
                      {ehVideo(g) ? (
                        <video src={g} muted />
                      ) : (
                        <img src={g} alt={`item ${i + 1} da galeria`} />
                      )}
                      <button
                        type="button"
                        onClick={() => setGaleria((lista) => lista.filter((_, j) => j !== i))}
                        className="ar-mini__x"
                        aria-label={`Remover item ${i + 1} da galeria`}
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Passo 2 — Prêmio */}
      {passo === 2 && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <section className="ar-cartao">
            <CabecalhoSecao
              icone={<Gift size={20} aria-hidden />}
              titulo="Prêmio"
              apoio="Descreva com clareza — isso gera confiança."
            />
            <div className="ar-form-grid mt-5">
              <div className="ar-col-toda">
                <Campo
                  rotulo="Prêmio principal *"
                  placeholder="Ex.: iPhone 16 128GB lacrado"
                  value={premio}
                  onChange={(e) => setPremio(e.target.value)}
                  erro={erros.premio}
                />
              </div>
            </div>
          </section>

          {/* Mais prêmios: cada linha vira 2º, 3º prêmio... — um número é
              sorteado pra cada um (Fabrício, 25/08). */}
          <section className="ar-cartao">
            <CabecalhoSecao
              icone={<Trophy size={20} aria-hidden />}
              titulo="Mais prêmios"
              apoio="2º, 3º prêmio… o sorteio tira um número pra cada."
            />
            {premiosExtras.length > 0 && (
              <div className="flex flex-col gap-2 mt-5">
                {premiosExtras.map((pr, i) => (
                  <div key={i} className="ar-linha-edit">
                    <span className="ar-linha-edit__prefixo ar-num">{i + 2}º</span>
                    <div className="flex-1 min-w-0">
                      <Campo
                        type="text"
                        value={pr}
                        aria-label={`Prêmio ${i + 2}`}
                        placeholder={`Prêmio ${i + 2} — ex.: R$ 200 no PIX`}
                        onChange={(e) =>
                          setPremiosExtras((l) => l.map((x, j) => (j === i ? e.target.value : x)))
                        }
                      />
                    </div>
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => setPremiosExtras((l) => l.filter((_, j) => j !== i))}
                        className="ar-icone-btn shrink-0"
                        aria-label={`Remover prêmio ${i + 2}`}
                      >
                        <X size={16} aria-hidden />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4">
              <Botao
                type="button"
                variante="contorno"
                tamanho="sm"
                onClick={() => setPremiosExtras((l) => [...l, ""])}
              >
                <Plus size={16} aria-hidden />
                Adicionar prêmio
              </Botao>
            </div>
          </section>

          <EditorCotas cotas={cotas} aoMudar={setCotas} />
        </div>
      )}

      {/* Passo 3 — Números e venda */}
      {passo === 3 && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <section className="ar-cartao">
            <CabecalhoSecao
              icone={<Ticket size={20} aria-hidden />}
              titulo="Números e venda"
              apoio="Quantidade, preço e os limites de cada pedido."
            />
            <div className="ar-form-grid mt-5">
              <Campo
                rotulo="Quantidade *"
                type="number"
                min={1}
                max={100000}
                inputMode="numeric"
                className="ar-num"
                value={totalNumeros}
                disabled={editando}
                onChange={(e) => setTotalNumeros(e.target.value)}
                erro={erros.totalNumeros}
                dica={editando ? "Não muda depois de criada" : undefined}
              />
              <Campo
                rotulo="Preço por número (R$) *"
                placeholder="5,00"
                inputMode="decimal"
                className="ar-num"
                value={precoReais}
                onChange={(e) => setPrecoReais(e.target.value)}
                erro={erros.precoReais}
              />
              <Campo
                rotulo="Máx. por pedido"
                type="number"
                min={1}
                max={1000}
                inputMode="numeric"
                className="ar-num"
                value={maxPorPedido}
                onChange={(e) => setMaxPorPedido(e.target.value)}
              />
              <Campo
                rotulo="Reserva expira (min)"
                type="number"
                min={5}
                max={1440}
                inputMode="numeric"
                className="ar-num"
                value={minutosReserva}
                onChange={(e) => setMinutosReserva(e.target.value)}
              />
            </div>

            <div className="ar-resumo-grid mt-5">
              <div className="ar-resumo-item">
                <p className="ar-rotulo truncate">números</p>
                <p className="ar-num font-bold mt-1.5 truncate" style={{ fontSize: "var(--ar-t-md)" }}>
                  {total > 0 ? total : "—"}
                </p>
              </div>
              <div className="ar-resumo-item">
                <p className="ar-rotulo truncate">cada</p>
                <p className="ar-num font-bold mt-1.5 truncate" style={{ fontSize: "var(--ar-t-md)" }}>
                  {cent > 0 ? fmtBRL(cent) : "—"}
                </p>
              </div>
              <div className="ar-resumo-item col-span-2">
                <p className="ar-rotulo truncate">potencial</p>
                <p
                  className="ar-num font-bold mt-1.5 truncate"
                  style={{ fontSize: "var(--ar-t-lg)", color: "var(--ar-roxo-alto)" }}
                >
                  {total > 0 && cent > 0 ? fmtBRL(total * cent) : "preencha quantidade e preço"}
                </p>
              </div>
            </div>
          </section>

          <section className="ar-cartao">
            <CabecalhoSecao
              icone={<Clock3 size={20} aria-hidden />}
              titulo="Sorteio"
              apoio="Por onde sai o resultado e quando você pretende sortear."
            />
            <div className="ar-form-grid mt-5">
              <div>
                <Selecao
                  rotulo="Sorteio por"
                  value={metodo}
                  disabled={qtdFixos > 0 && editando}
                  onChange={(e) => setMetodo(e.target.value as MetodoSorteio)}
                  opcoes={(Object.entries(ROTULO_METODO_SORTEIO) as [MetodoSorteio, string][]).map(
                    ([valor, rotulo]) => ({ valor, rotulo }),
                  )}
                />
                {metodo !== "plataforma" && (
                  <p className="text-sm ar-txt-3 mt-2">
                    Próximo sorteio:{" "}
                    <strong className="ar-txt-1">{rotuloProximoSorteio(metodo)}</strong> ·{" "}
                    {contagemSorteio(metodo, null)}
                  </p>
                )}
                {qtdFixos > 0 && (
                  <p className="text-sm mt-2" style={{ color: "var(--ar-aviso)" }}>
                    {qtdFixos} número{qtdFixos > 1 ? "s" : ""} fixo{qtdFixos > 1 ? "s" : ""} neste
                    tipo — a rifa mantém sempre o mesmo tipo de sorteio.
                  </p>
                )}
              </div>
              <Campo
                rotulo="Data prevista do sorteio"
                type="date"
                value={dataPrevista ?? ""}
                onChange={(e) => setDataPrevista(e.target.value)}
              />
            </div>
          </section>

          <EditorNumerosFixos metodo={metodo} aoNotificar={aoNotificar} aoMudarQtd={setQtdFixos} />
          <EditorPromocoes promocoes={promocoes} aoMudar={setPromocoes} />
        </div>
      )}

      {/* Passo 4 — Revisão */}
      {passo === 4 && (
        <PassoRevisao
          titulo={titulo}
          premio={premio}
          total={total}
          precoCentavos={cent}
          metodo={metodo}
          promocoes={promocoes}
          cotas={cotas}
          editando={editando}
        />
      )}

      {/* Navegação — sempre alcançável, acima da tab bar no celular */}
      <div className="ar-sticky-bottom mt-6">
        <Botao
          type="button"
          variante="fantasma"
          onClick={passo === 1 ? aoCancelar : () => setPasso((s) => Math.max(1, s - 1))}
          disabled={salvando}
        >
          <ArrowLeft size={16} aria-hidden />
          {passo === 1 ? "Cancelar" : "Voltar"}
        </Botao>
        <span className="ar-rotulo ml-auto hidden sm:inline">passo {passo} de 4</span>
        {passo < 4 ? (
          <Botao type="button" onClick={avancar} className="ml-auto sm:ml-3">
            Continuar
            <ArrowRight size={16} aria-hidden />
          </Botao>
        ) : (
          <Botao
            type="button"
            onClick={() => void salvar()}
            carregando={salvando}
            variante="primario"
            className="ml-auto sm:ml-3"
          >
            {editando ? <Save size={16} aria-hidden /> : <Rocket size={16} aria-hidden />}
            {editando ? "Salvar alterações" : "Criar rifa"}
          </Botao>
        )}
      </div>
    </div>
  );
};
