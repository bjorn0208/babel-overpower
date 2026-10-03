/**
 * Lógica pura da aba "Tarefas do time" (lote 5 do plano PLANO-APP-IGUAL-AO-ARTEFATO.md, 2026-09-24).
 * Sem React e sem "@/": pode ser carregada pelo teste com o node.
 *
 * Tudo aqui porta funções do artefato `nova-peca-gerencia/1-financeiro-novo/financeiro.html`
 * (citado como `art.:linha`). Onde o app decide diferente, está dito ao lado.
 * Arquivo NOVO: não altera nenhum export de calculos.ts, logica-atendimento.ts ou tipos.ts.
 */

import { diasParaPrazo, equipeSuporte, tarefaAberta, tarefaAtrasada, type CargaPessoa, type EventoSemana } from "./calculos";
import type { Pendencia } from "./logica-atendimento";
import {
  STATUS_TAREFA,
  dataBR,
  ymd,
  type Aba,
  type Dados,
  type PrioridadeTarefa,
  type ReuniaoEquipe,
  type StatusTarefa,
  type Tarefa,
  type TomSelo,
} from "./tipos";

/** art.:582 */
export const DIAS_SEMANA_TF = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Dia da semana de uma data AAAA-MM-DD, sem fuso (art.:583 `diaSemana`). */
export function diaSemanaDe(data: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data ?? "");
  if (!m) return "";
  return DIAS_SEMANA_TF[new Date(+m[1], +m[2] - 1, +m[3]).getDay()];
}

/** art.:3440 `iniciais` */
export function iniciaisTf(nome: string | null | undefined): string {
  const p = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return ((p[0][0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : (p[0][1] ?? ""))).toUpperCase();
}

// ---------------------------------------------------------------------------
// Quem é "o time" — art.:3429 `pessoasTime`: funcionários ativos + equipe de suporte + vendedores
// internos (ou, se não houver interno, todos os ativos: art.:2199 `nomesComercial`). Sem repetir nome
// (comparação sem diferenciar maiúsculas), em ordem alfabética.
// ---------------------------------------------------------------------------

function nomesComercial(dados: Dados): string[] {
  const ativos = dados.vendedores.filter((v) => v.ativo !== false);
  const internos = ativos.filter((v) => (v.tipo || "interno") === "interno");
  return (internos.length ? internos : ativos).map((v) => v.nome);
}

export function pessoasTime(dados: Dados): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  const add = (n: string | null | undefined) => {
    const nome = (n ?? "").trim();
    if (nome && !vistos.has(nome.toLowerCase())) {
      vistos.add(nome.toLowerCase());
      saida.push(nome);
    }
  };
  for (const f of dados.funcionarios) if (f.ativo !== false) add(f.nome);
  for (const n of equipeSuporte(dados.config)) add(n);
  for (const n of nomesComercial(dados)) add(n);
  return saida.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ---------------------------------------------------------------------------
// Cliente da tarefa. O artefato só olha `clientes` (art.:3471 `cliById`); aqui a implementação e o
// suporte não leem `gestao_clientes` (RLS), então o nome também vem de `cliente_nome` das
// implementações e atendimentos de suporte, que esses papéis leem.
// ---------------------------------------------------------------------------

export function nomeClienteTf(dados: Dados, id: string | null | undefined): string | null {
  if (!id) return null;
  const c = dados.clientes.find((x) => x.id === id);
  if (c?.nome) return c.nome;
  const i = dados.implementacoes.find((x) => x.cliente_id === id && x.cliente_nome);
  if (i?.cliente_nome) return i.cliente_nome;
  const s = dados.suporteAtend.find((x) => x.cliente_id === id && x.cliente_nome);
  return s?.cliente_nome ?? null;
}

/** Opções do select "Cliente (opcional)" (art.:3864 `optsCli`), ordenadas por nome. */
export function clientesParaTarefa(dados: Dados): Array<[string, string]> {
  const mapa = new Map<string, string>();
  for (const c of dados.clientes) if (c.id && c.nome) mapa.set(c.id, c.nome);
  for (const i of dados.implementacoes)
    if (i.cliente_id && i.cliente_nome && !mapa.has(i.cliente_id)) mapa.set(i.cliente_id, i.cliente_nome);
  for (const s of dados.suporteAtend)
    if (s.cliente_id && s.cliente_nome && !mapa.has(s.cliente_id)) mapa.set(s.cliente_id, s.cliente_nome);
  return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
}

// ---------------------------------------------------------------------------
// Filtro e ordem do quadro — art.:3466 `tfFiltra` e :3474 `tfOrdem`
// ---------------------------------------------------------------------------

export const normalizarTf = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export interface FiltroTarefas {
  /** "todos", "sem" ou o nome de uma pessoa */
  responsavel: string;
  /** "todas" ou a chave da área */
  area: string;
  busca: string;
}

export function tarefaPassaFiltro(t: Tarefa, f: FiltroTarefas, dados: Dados): boolean {
  if (f.responsavel === "sem" && t.responsavel) return false;
  if (f.responsavel !== "todos" && f.responsavel !== "sem" && t.responsavel !== f.responsavel) return false;
  if (f.area !== "todas" && (t.area || "geral") !== f.area) return false;
  const q = normalizarTf(f.busca.trim());
  if (q) {
    const texto = [t.titulo, t.descricao ?? "", t.responsavel ?? "", nomeClienteTf(dados, t.cliente_id) ?? ""].join(" ");
    if (normalizarTf(texto).indexOf(q) < 0) return false;
  }
  return true;
}

const PESO_PRIO: Record<PrioridadeTarefa, number> = { alta: 0, media: 1, baixa: 2 };

export function ordenarTarefasTf(a: Tarefa, b: Tarefa): number {
  const pa = a.prazo || "9999";
  const pb = b.prazo || "9999";
  if (pa !== pb) return pa < pb ? -1 : 1;
  const w = PESO_PRIO[a.prioridade ?? "media"] - PESO_PRIO[b.prioridade ?? "media"];
  if (w !== 0) return w;
  return (a.criado_em || "") < (b.criado_em || "") ? -1 : 1;
}

/** art.:3449 `tfPrazo`, completo: inclui "dia da semana · dd/mm" nos próximos 6 dias. */
export function rotuloPrazoTf(t: Pick<Tarefa, "prazo" | "status">, hoje: Date): { texto: string; tom: TomSelo } {
  if (!t.prazo) return { texto: "", tom: "neutro" };
  if (!tarefaAberta(t)) return { texto: dataBR(t.prazo), tom: "neutro" };
  const d = diasParaPrazo(t.prazo, hoje);
  if (d === null) return { texto: dataBR(t.prazo), tom: "neutro" };
  if (d < 0) return { texto: `Atrasada · ${dataBR(t.prazo)}`, tom: "erro" };
  if (d === 0) return { texto: "Vence hoje", tom: "aviso" };
  if (d === 1) return { texto: "Vence amanhã", tom: "aviso" };
  if (d <= 6) return { texto: `${diaSemanaDe(t.prazo)} · ${dataBR(t.prazo).slice(0, 5)}`, tom: "neutro" };
  return { texto: dataBR(t.prazo), tom: "neutro" };
}

// ---------------------------------------------------------------------------
// Os 5 indicadores do topo — art.:3555-3576
// ---------------------------------------------------------------------------

export interface KpisTarefas {
  abertas: number;
  bloqueadas: number;
  atrasadas: number;
  vencem7: number;
  /** último dia da janela de 7 dias, AAAA-MM-DD */
  ate: string;
  pendenciasAbertas: number;
  proximaEquipe: ReuniaoEquipe | null;
}

const chaveReu = (r: Pick<ReuniaoEquipe, "data" | "hora">) => `${r.data ?? ""} ${r.hora ?? ""}`;

/** art.:578 `reuSort` (data + hora, crescente). */
export const ordenarReuEquipe = (a: ReuniaoEquipe, b: ReuniaoEquipe): number =>
  chaveReu(a) < chaveReu(b) ? -1 : chaveReu(a) > chaveReu(b) ? 1 : 0;

export function kpisTarefas(dados: Dados, hoje: Date, pendencias: Pendencia[]): KpisTarefas {
  const h0 = ymd(hoje);
  const ate = ymd(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 6));
  const abertas = dados.tarefas.filter(tarefaAberta);
  const proximas = dados.reunioesEquipe
    .filter((r) => r.status === "Agendada" && !!r.data && r.data >= h0)
    .sort(ordenarReuEquipe);
  const usadas = new Set(dados.tarefas.map((t) => t.origem_key).filter(Boolean));
  return {
    abertas: abertas.length,
    bloqueadas: abertas.filter((t) => t.status === "bloqueada").length,
    atrasadas: abertas.filter((t) => tarefaAtrasada(t, hoje)).length,
    vencem7: abertas.filter((t) => !!t.prazo && t.prazo >= h0 && t.prazo <= ate).length,
    ate,
    pendenciasAbertas: pendencias.filter((p) => !usadas.has(p.chave)).length,
    proximaEquipe: proximas[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Pendências: filtro por papel/pessoa/área (art.:3602-3608), "Abrir" (art.:3620) e o preenchimento
// da tarefa que nasce da pendência (art.:3799-3803).
// ---------------------------------------------------------------------------

/** art.:3255 */
export const AREA_ABA: Record<string, Aba> = {
  implementacao: "implementacao",
  programador: "programador",
  suporte: "suporte",
  comercial: "indicacoes",
};

export function filtrarPendencias(
  pendencias: Pendencia[],
  abas: Aba[],
  responsavel: string,
  area: string,
): Pendencia[] {
  return pendencias.filter((p) => {
    const aba = AREA_ABA[p.area];
    if (aba && !abas.includes(aba)) return false;
    if (responsavel === "sem" && p.responsavel) return false;
    if (responsavel !== "todos" && responsavel !== "sem" && p.responsavel !== responsavel) return false;
    if (area !== "todas" && p.area !== area) return false;
    return true;
  });
}

/** Para onde o "Abrir" da pendência leva. A chave é estável e carrega a origem (logica-atendimento.ts). */
export type DestinoPendencia =
  | { tipo: "aba"; aba: Aba; id: string | null }
  | { tipo: "ata"; reuniaoId: string };

export function destinoPendencia(p: Pendencia, dados: Dados): DestinoPendencia | null {
  const partes = p.chave.split(":");
  const tipo = partes[0];
  if (tipo === "eq-ata" || tipo === "eq-vencida") return { tipo: "ata", reuniaoId: partes[1] };
  if (tipo === "reu-vencida" || tipo === "reu-relato") {
    const colecao = partes[1];
    const id = partes[2];
    if (colecao === "reunioes") return { tipo: "aba", aba: "suporte", id: null }; // art.:3529 tf-ir-suporte
    const r = dados.implReunioes.find((x) => x.id === id);
    const alvo = r?.impl_id ?? null;
    if (r?.area === "ind") return { tipo: "aba", aba: "indicacoes", id: alvo };
    if (r?.area === "prog") return { tipo: "aba", aba: "programador", id: alvo };
    return { tipo: "aba", aba: "implementacao", id: alvo };
  }
  if (tipo === "prog-parado") return { tipo: "aba", aba: "programador", id: p.implId ?? null };
  if (p.implId) return { tipo: "aba", aba: "implementacao", id: p.implId };
  return null;
}

/** art.:3620: atalhos da própria aba sempre; os de outra aba só se o papel vê a aba da área. */
export function podeAbrirPendencia(p: Pendencia, destino: DestinoPendencia | null, abas: Aba[]): boolean {
  if (!destino) return false;
  if (destino.tipo === "ata") return true;
  return abas.includes(AREA_ABA[p.area] ?? "tarefas");
}

/** Cliente da pendência: da implementação, ou da reunião de origem (art.:3504 e :3531 `clienteId`). */
export function clienteIdDaPendencia(p: Pendencia, dados: Dados): string | null {
  const partes = p.chave.split(":");
  if (partes[0] === "reu-vencida" || partes[0] === "reu-relato") {
    const lista = partes[1] === "reunioes" ? dados.reunioes : dados.implReunioes;
    return lista.find((r) => r.id === partes[2])?.cliente_id ?? null;
  }
  if (p.implId) return dados.implementacoes.find((i) => i.id === p.implId)?.cliente_id ?? null;
  return null;
}

/** Campos que a tela "Nova tarefa" já abre preenchidos. */
export interface PresetTarefa {
  titulo?: string;
  descricao?: string;
  responsavel?: string;
  prioridade?: PrioridadeTarefa;
  area?: string;
  cliente_id?: string | null;
  impl_id?: string | null;
  origem_key?: string | null;
  prazo?: string;
}

/** art.:3799-3803 `tf-da-pend`: título "· cliente", detalhe, responsável, prioridade, área, cliente, prazo hoje. */
export function presetDaPendencia(p: Pendencia, dados: Dados, hoje: Date): PresetTarefa {
  return {
    titulo: p.titulo + (p.cliente && p.cliente !== "Equipe" ? ` · ${p.cliente}` : ""),
    descricao: p.detalhe,
    responsavel: p.responsavel,
    prioridade: p.prioridade,
    area: p.area,
    cliente_id: clienteIdDaPendencia(p, dados),
    impl_id: p.implId ?? null,
    origem_key: p.chave,
    prazo: ymd(hoje),
  };
}

/** art.:3788 `tf-nova`: o que o filtro já escolheu vira o padrão da tarefa nova. */
export function presetNovaTarefa(responsavel: string, area: string): PresetTarefa {
  return {
    responsavel: responsavel !== "todos" && responsavel !== "sem" ? responsavel : "",
    area: area !== "todas" ? area : "geral",
  };
}

// ---------------------------------------------------------------------------
// Mover no quadro — art.:3790-3797 e :3825 `tfMudarStatus`
// ---------------------------------------------------------------------------

export function statusVizinho(t: Pick<Tarefa, "status">, direcao: -1 | 1): StatusTarefa {
  const ks = STATUS_TAREFA.map(([k]) => k);
  const i = ks.indexOf(t.status || "afazer") + direcao;
  return ks[Math.max(0, Math.min(ks.length - 1, i))];
}

/** Ir para "bloqueada" nunca é direto: abre a pergunta "O que está bloqueando?" (art.:3796). */
export const moverPedeMotivo = (novo: StatusTarefa): boolean => novo === "bloqueada";

/**
 * O que gravar ao mudar o status. Sair de "bloqueada" LIMPA o motivo (art.:3827; no banco o "vazio"
 * é `null`). Concluir carimba a hora; qualquer outro status apaga o carimbo.
 */
export function patchStatusTarefa(
  novo: StatusTarefa,
  agoraIso: string,
  bloqueio?: string,
): { status: StatusTarefa; concluido_em: string | null; bloqueio: string | null } {
  return {
    status: novo,
    concluido_em: novo === "concluida" ? agoraIso : null,
    bloqueio: novo === "bloqueada" ? (bloqueio ?? "").trim() || null : null,
  };
}

// ---------------------------------------------------------------------------
// Reuniões da equipe — art.:3709-3754
// ---------------------------------------------------------------------------

export type FiltroReuEquipe = "proximas" | "realizadas" | "todas";

export function reunioesEquipeDaVisao(lista: ReuniaoEquipe[], filtro: FiltroReuEquipe): ReuniaoEquipe[] {
  const saida = lista
    .filter((r) =>
      filtro === "proximas" ? r.status === "Agendada" : filtro === "realizadas" ? r.status === "Concluída" : true,
    )
    .sort(ordenarReuEquipe);
  if (filtro !== "proximas") saida.reverse();
  return saida;
}

/** Status tratado como no artefato: sem status = Agendada. */
export const statusReuEquipe = (r: Pick<ReuniaoEquipe, "status">): "Agendada" | "Concluída" | "Cancelada" =>
  r.status ?? "Agendada";

export function reuEquipeVencida(r: ReuniaoEquipe, hoje: Date): boolean {
  return statusReuEquipe(r) === "Agendada" && !!r.data && r.data < ymd(hoje);
}

/** art.:574 `statusReuPill` com os selos da babel. */
export const tomStatusReuEquipe = (st: string): TomSelo =>
  st === "Concluída" ? "ok" : st === "Cancelada" ? "erro" : "aurora";

/** Pílula de um encaminhamento (art.:3739): concluída ok, atrasada erro, resto neutro. */
export function tomEncaminhamento(t: Pick<Tarefa, "status" | "prazo">, hoje: Date): TomSelo {
  return t.status === "concluida" ? "ok" : tarefaAtrasada(t, hoje) ? "erro" : "neutro";
}

// ---------------------------------------------------------------------------
// Semana — art.:3667-3707, com o que o clique abre e o nome do indicado (T27, T28)
// ---------------------------------------------------------------------------

export type AlvoEvento =
  | { tipo: "tarefa"; id: string }
  | { tipo: "reuEquipe"; id: string }
  | { tipo: "aba"; aba: Aba; id: string | null };

export interface EventoSemanaTf extends EventoSemana {
  alvo: AlvoEvento;
}

export function semanaDoTime(dados: Dados, inicio: Date, quem = "todos"): EventoSemanaTf[][] {
  const dias: string[] = [];
  for (let i = 0; i < 7; i++) dias.push(ymd(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)));
  const de = dias[0];
  const ate = dias[6];
  const caixas: EventoSemanaTf[][] = dias.map(() => []);
  const serve = (resp: string | null, participantes?: string[] | null): boolean =>
    quem === "todos" || resp === quem || (participantes ?? []).includes(quem);
  const por = (data: string | null, e: Omit<EventoSemanaTf, "dia">) => {
    if (!data || data < de || data > ate) return;
    caixas[dias.indexOf(data)].push({ ...e, dia: data });
  };
  const nomeCli = (id: string | null) => nomeClienteTf(dados, id) ?? "cliente";

  for (const r of dados.reunioesEquipe) {
    if (r.status === "Cancelada" || !serve("", r.participantes)) continue;
    por(r.data, {
      hora: r.hora ?? "",
      tipo: "equipe",
      titulo: r.titulo || r.tipo || "Reunião da equipe",
      quem: `${(r.participantes ?? []).length} participante(s)`,
      alvo: { tipo: "reuEquipe", id: r.id },
    });
  }
  for (const r of dados.reunioes) {
    if (r.status !== "Agendada" && r.status !== "Concluída") continue;
    if (!serve(r.responsavel)) continue;
    por(r.data, {
      hora: r.hora ?? "",
      tipo: "sup",
      titulo: `${r.tipo || "Suporte"} · ${nomeCli(r.cliente_id)}`,
      quem: r.responsavel || "sem responsável",
      alvo: { tipo: "aba", aba: "suporte", id: null },
    });
  }
  for (const r of dados.implReunioes) {
    if (r.status !== "Agendada" && r.status !== "Concluída") continue;
    if (!serve(r.responsavel)) continue;
    const ind = r.area === "ind" ? dados.indicacoes.find((x) => x.id === r.impl_id) : undefined;
    const nome = ind ? (ind.lead_nome ?? "") : nomeCli(r.cliente_id);
    por(r.data, {
      hora: r.hora ?? "",
      tipo: r.area === "prog" ? "prog" : r.area === "ind" ? "com" : "impl",
      titulo: `${r.tipo || "Reunião"} · ${nome}`,
      quem: r.responsavel || "sem responsável",
      alvo: {
        tipo: "aba",
        aba: r.area === "ind" ? "indicacoes" : r.area === "prog" ? "programador" : "implementacao",
        id: r.impl_id,
      },
    });
  }
  for (const t of dados.tarefas) {
    if (!t.prazo || !serve(t.responsavel)) continue;
    const feito = t.status === "concluida";
    por(t.prazo, {
      hora: "",
      tipo: "tarefa",
      titulo: t.titulo || "Tarefa",
      quem: `${t.responsavel || "sem responsável"}${feito ? " · concluída" : ""}`,
      feito,
      alvo: { tipo: "tarefa", id: t.id },
    });
  }
  for (const c of caixas) c.sort((a, b) => ((a.hora || "99") < (b.hora || "99") ? -1 : 1));
  return caixas;
}

/** Cabeçalho da semana: "dd/mm a dd/mm/aaaa" (art.:3687), sem repetir o ano. */
export function rotuloSemana(inicio: Date): string {
  const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6);
  return `${dataBR(ymd(inicio)).slice(0, 5)} a ${dataBR(ymd(fim))}`;
}

// ---------------------------------------------------------------------------
// Por pessoa — art.:3756-3783, sobre `pessoasTime` (T36). calculos.cargaPorPessoa só olha os
// funcionários e continua como está (outro código usa); aqui a mesma conta sobre o time inteiro.
// ---------------------------------------------------------------------------

export function cargaDoTime(dados: Dados, hoje: Date, pessoas: string[]): CargaPessoa[] {
  const h0 = ymd(hoje);
  const fim = ymd(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 6));
  const naJanela = (data: string | null): boolean => !!data && data >= h0 && data <= fim;
  return pessoas
    .map((n): CargaPessoa => {
      const tar = dados.tarefas.filter((t) => tarefaAberta(t) && t.responsavel === n);
      const impl = dados.implementacoes.filter(
        (i) => i.status !== "concluida" && (i.responsavel === n || (i.status === "programador" && i.programador === n)),
      ).length;
      const reu =
        [...dados.reunioes, ...dados.implReunioes].filter(
          (r) => r.status === "Agendada" && r.responsavel === n && naJanela(r.data),
        ).length +
        dados.reunioesEquipe.filter(
          (r) => r.status === "Agendada" && (r.participantes ?? []).includes(n) && naJanela(r.data),
        ).length;
      return {
        nome: n,
        tarefas: tar.length,
        atrasadas: tar.filter((t) => tarefaAtrasada(t, hoje)).length,
        vencemEm7: tar.filter((t) => naJanela(t.prazo)).length,
        bloqueadas: tar.filter((t) => t.status === "bloqueada").length,
        implementacoes: impl,
        reunioesEm7: reu,
        carga: tar.length + impl,
      };
    })
    .sort((a, b) => b.atrasadas - a.atrasadas || b.carga - a.carga || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ---------------------------------------------------------------------------
// Filtro inicial — art.:4377: quem não é admin abre a aba já filtrado na própria pessoa
// (`gestao_acessos.pessoa`). Admin, ou sem pessoa ligada ao acesso, abre em "Todo o time".
// ---------------------------------------------------------------------------

export function responsavelInicialTf(ehAdmin: boolean, pessoaDoAcesso: string | null | undefined): string {
  const p = (pessoaDoAcesso ?? "").trim();
  return !ehAdmin && p ? p : "todos";
}

/** Nota do topo do modal da tarefa (art.:3848). */
export function notaModalTarefa(
  t: Pick<Tarefa, "criado_em" | "status" | "concluido_em"> | null,
  preset: PresetTarefa | null,
  reuniao: ReuniaoEquipe | null,
  dataHora: (iso: string | null | undefined) => string,
): string {
  if (!t && preset?.origem_key) return "Criada a partir de uma pendência da operação. Ajuste o que precisar.";
  if (reuniao) return `Encaminhamento da reunião “${reuniao.titulo || reuniao.tipo || ""}” de ${dataBR(reuniao.data)}.`;
  if (!t) return "Tarefa do time interno. Só o título é obrigatório.";
  return (
    `Criada em ${dataHora(t.criado_em)}` +
    (t.status === "concluida" && t.concluido_em ? ` · concluída em ${dataHora(t.concluido_em)}` : "")
  );
}
