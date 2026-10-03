/**
 * Lógica PURA do histórico de atendimento (Lote H): diário de 15 dias, tentativas de contato,
 * movimentações entre implementação e programador, pedidos em aberto. Nenhuma chamada ao banco aqui
 * (por isso não importa "./dados" nem `@/integrations/supabase/client`) — é o que permite este arquivo
 * ser testado direto pelo `node`, no mesmo estilo de `calculos.ts`/`TESTES-CALCULOS`.
 *
 * Formato REAL das colunas (conferido no banco de produção pela auditoria de 2026-09-22,
 * `AUDITORIA-SERJAO-APP.md`, e no backup `arquivo/2026-09-21/babel-os-financeiro-backup.json`, 33
 * implementações) — é isto que este arquivo lê e grava, não o que seria "mais limpo" inventar:
 *
 *  - `gestao_implementacoes.tentativas`: **array** `{id,quando,canal,por,obs}[]` — SÓ do lado implementação
 *    (33 de 35 linhas reais são array; nunca objeto `{impl,prog}`).
 *  - `gestao_implementacoes.dias`: dict por dia (`{"1":{...}, "2":{...}}`) — SÓ do lado implementação.
 *  - `gestao_implementacoes.retornos`: array — só "implementação retornou ao programador".
 *  - O lado do PROGRAMADOR mora inteiro em `extras` (mapa-colecoes.ts manda todo campo sem coluna própria
 *    para lá, e é onde o backup real tem o dado): `extras.diasProg` (dict por dia), `extras.tentativasProg`
 *    (array), `extras.obsParaProg` (string, o recado ao enviar), além de `extras.devolucoes`/`extras.entregas`
 *    (arrays, já sem coluna própria por natureza). Decisão do Theus (2026-09-22): ficam aí, sem migração —
 *    é onde o dado já existe e para onde o conversor de backup aponta.
 *  - `gestao_suporte_atend`/`gestao_indicacoes`: `tentativas` e `dias` são diretos (array/dict), um único
 *    contexto por tabela — sem a duplicidade impl/prog de `gestao_implementacoes`.
 *
 * Porte de financeiro-original: CTX_ATEND (2180-2210), diaTemRegistro/diasPreenchidos/diaAtualDe (1959-1978),
 * pendenciasProg (2017-2021), movimentos/painelMovimentos (2251-2268), historicoSomenteLeitura (2270-2283),
 * modalTentativa/removerTentativa (2935-2972).
 */

import {
  dataBR,
  parseData,
  STATUS_INDICACAO,
  type Cliente,
  type ContextoAtendimento,
  type Dados,
  type DiaRegistro,
  type ImplReuniao,
  type Implementacao,
  type Indicacao,
  type RegistroVolta,
  type Reuniao,
  type SuporteAtend,
  type Tentativa,
  type TomSelo,
  ymd,
  type Tarefa,
} from "./tipos";
import { TOM_STATUS_INDICACAO } from "./logica-indicacao";

export type Contexto = ContextoAtendimento;

/** DIAS_IMPL — financeiro-original:1929. */
export const DIAS_ATENDIMENTO = 15;

export const CANAIS_TENTATIVA = ["WhatsApp", "Ligação", "E-mail", "Outro"] as const; // financeiro-original:1938

// ---------------------------------------------------------------------------
// Campos do diário por contexto — CTX_ATEND.*.campos (financeiro-original:2182-2210)
// ---------------------------------------------------------------------------

export interface CampoDiario {
  chave: string;
  rotulo: string;
  tipo: "textarea" | "texto" | "data";
  dica: string;
}

export const CAMPOS_DIARIO: Record<Contexto, CampoDiario[]> = {
  impl: [
    { chave: "andamento", rotulo: "Como está o andamento", tipo: "textarea", dica: "O que foi feito hoje com o cliente" },
    { chave: "aguardando", rotulo: "O que está aguardando", tipo: "texto", dica: "Ex.: acesso ao WhatsApp do cliente, validação do fluxo" },
    { chave: "pedidoProg", rotulo: "Pedidos passados ao programador em", tipo: "data", dica: "" },
    { chave: "resolvidoProg", rotulo: "Programador resolveu em", tipo: "data", dica: "" },
    { chave: "pedidos", rotulo: "Pedidos ao programador / pendências", tipo: "texto", dica: "O que foi pedido" },
  ],
  prog: [
    { chave: "feito", rotulo: "O que foi desenvolvido hoje", tipo: "textarea", dica: "Ajustes, integrações, correções feitas" },
    { chave: "aguardando", rotulo: "O que está aguardando", tipo: "texto", dica: "Ex.: acesso à API do cliente, retorno da implementação" },
    { chave: "recebido", rotulo: "Pedido recebido em", tipo: "data", dica: "" },
    { chave: "resolvido", rotulo: "Resolvido em", tipo: "data", dica: "" },
    { chave: "pendencias", rotulo: "Pendências / observações técnicas", tipo: "texto", dica: "O que ainda falta" },
  ],
  // "Cada aba tem seus próprios campos no mesmo registro" (financeiro-original:2180): suporte reaproveita
  // os campos da implementação, mas grava em `gestao_suporte_atend` (tabelaDoContexto cuida disso).
  sup: [
    { chave: "andamento", rotulo: "Como está o andamento", tipo: "textarea", dica: "O que foi feito hoje com o cliente" },
    { chave: "aguardando", rotulo: "O que está aguardando", tipo: "texto", dica: "Ex.: acesso ao WhatsApp do cliente, validação do fluxo" },
    { chave: "pedidoProg", rotulo: "Pedidos passados ao programador em", tipo: "data", dica: "" },
    { chave: "resolvidoProg", rotulo: "Programador resolveu em", tipo: "data", dica: "" },
    { chave: "pedidos", rotulo: "Pedidos ao programador / pendências", tipo: "texto", dica: "O que foi pedido" },
  ],
  ind: [
    { chave: "andamento", rotulo: "Como está a conversa", tipo: "textarea", dica: "O que foi conversado hoje com o indicado" },
    { chave: "aguardando", rotulo: "O que está aguardando", tipo: "texto", dica: "Ex.: retorno do indicado, envio de proposta" },
    { chave: "proximoPasso", rotulo: "Próximo passo", tipo: "texto", dica: "Ex.: apresentar a babel, enviar proposta" },
    { chave: "retornoEm", rotulo: "Retornar em", tipo: "data", dica: "" },
    { chave: "observacoes", rotulo: "Observações", tipo: "texto", dica: "Detalhes importantes do lead" },
  ],
};

export const ROTULO_DIARIO: Record<Contexto, string> = {
  impl: "Andamento diário",
  prog: "Andamento diário do P&D",
  sup: "Andamento diário",
  ind: "Andamento do atendimento",
};

// ---------------------------------------------------------------------------
// Tabela por contexto
// ---------------------------------------------------------------------------

export type TabelaAtendimento = "gestao_implementacoes" | "gestao_suporte_atend" | "gestao_indicacoes";
export type ChaveDadosAtendimento = "implementacoes" | "suporteAtend" | "indicacoes";

export function tabelaDoContexto(ctx: Contexto): TabelaAtendimento {
  if (ctx === "sup") return "gestao_suporte_atend";
  if (ctx === "ind") return "gestao_indicacoes";
  return "gestao_implementacoes";
}

/** Chave de `Dados`/`recarregar()` correspondente à tabela deste contexto. */
export function chaveDadosDoContexto(ctx: Contexto): ChaveDadosAtendimento {
  if (ctx === "sup") return "suporteAtend";
  if (ctx === "ind") return "indicacoes";
  return "implementacoes";
}

// ---------------------------------------------------------------------------
// extras: tudo que o programador grava mora aqui, sem coluna própria (B2/B3 da auditoria)
// ---------------------------------------------------------------------------

export interface ExtrasImplementacao {
  /** Diário do programador — CTX_ATEND.prog (chaves "1".."15"). Dado real: `extras.diasProg`. */
  diasProg?: Record<string, DiaRegistro>;
  /** Tentativas do programador — dado real: `extras.tentativasProg` (array, vazio em todas as linhas hoje). */
  tentativasProg?: Tentativa[];
  /** Recado da implementação ao enviar ao programador (obsParaProg do original). Dado real em 30/35 linhas. */
  obsParaProg?: string;
  /** "Programador devolveu à implementação" — append-only, mesmo padrão de `retornos`. 2 linhas reais. */
  devolucoes?: RegistroVolta[];
  /** "Programador concluiu e devolveu para validação" — append-only. 28 linhas reais. */
  entregas?: RegistroVolta[];
  /** "Anotações gerais do programador" (artefato :2298-2300). Lote 3 (2026-09-24): agora tem tela. */
  notasProg?: string;
  /** "O que o programador entregou" da última entrega (artefato :2597). */
  obsProgFinal?: string;
  /** Quando a implementação concluiu e enviou ao P&D (artefato :2577). */
  implConcluidoEm?: string;
  [outro: string]: unknown;
}

function comoDicionarioDeDias(v: unknown): Record<string, DiaRegistro> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, DiaRegistro>) : {};
}

function comoListaDeTentativas(v: unknown): Tentativa[] {
  return Array.isArray(v) ? (v as Tentativa[]) : [];
}

/** Forma mínima aceita por estas funções (Implementacao/SuporteAtend/Indicacao cabem todas aqui). */
export interface RegistroComHistorico {
  id: string;
  dias: unknown;
  tentativas: unknown;
  extras: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Diário: leitura e mescla imutável (financeiro-original:2814-2826)
// ---------------------------------------------------------------------------

/** Lê o diário deste contexto: `extras.diasProg` para o programador, `dias` (direto) para os demais. */
export function diarioDoContexto(
  ctx: Contexto,
  registro: Pick<RegistroComHistorico, "dias" | "extras">,
): Record<string, DiaRegistro> {
  if (ctx === "prog") return comoDicionarioDeDias((registro.extras as ExtrasImplementacao).diasProg);
  return comoDicionarioDeDias(registro.dias);
}

/**
 * Devolve o PATCH pronto para `atualizar()` com um campo do dia mesclado — nunca a coluna errada.
 * Programador → `{extras: {...extras, diasProg: {...}}}` (preserva os outros campos de `extras`, B1/A1).
 * Demais contextos → `{dias: {...}}`.
 */
export function patchDia(
  ctx: Contexto,
  registro: Pick<RegistroComHistorico, "dias" | "extras">,
  dia: number,
  campo: string,
  valor: string,
): Record<string, unknown> {
  const diarioAtual = diarioDoContexto(ctx, registro);
  const diarioNovo: Record<string, DiaRegistro> = {
    ...diarioAtual,
    [dia]: { ...(diarioAtual[dia] ?? {}), [campo]: valor },
  };
  if (ctx === "prog") return { extras: { ...registro.extras, diasProg: diarioNovo } };
  return { dias: diarioNovo };
}

/** diaTemRegistro — financeiro-original:1964-1968. */
export function diaTemRegistro(dia: DiaRegistro | undefined): boolean {
  if (!dia) return false;
  return Object.values(dia).some((v) => typeof v === "string" && v.trim().length > 0);
}

/** diasPreenchidos — financeiro-original:1969-1973. */
export function diasPreenchidos(diario: Record<string, DiaRegistro>): number {
  return Object.values(diario).filter(diaTemRegistro).length;
}

/** resumoTxt do dia fechado — financeiro-original:2421-2422 (primeiro campo preenchido, na ordem). */
export function resumoDoDia(campos: CampoDiario[], dia: DiaRegistro | undefined): string {
  if (!dia) return "";
  for (const c of campos) {
    const v = dia[c.chave];
    if (v && String(v).trim()) {
      if (c.tipo === "data") return `${c.rotulo} ${dataBR(v)}`;
      return c.chave === "aguardando" ? `Aguardando: ${v}` : String(v);
    }
  }
  return "";
}

/** diaAtualDe — financeiro-original:1974-1977 (dia 1 = dia do início; hoje = diferença + 1). */
export function diaAtualDe(inicioIso: string | null | undefined, hoje: Date): number {
  const ini = parseData(inicioIso);
  if (!ini) return 0;
  return Math.floor((hoje.getTime() - ini.getTime()) / 86_400_000) + 1;
}

/** dataDoDiaDe — financeiro-original:1978. */
export function dataDoDiaDe(inicioIso: string | null | undefined, n: number): Date | null {
  const ini = parseData(inicioIso);
  if (!ini) return null;
  const d = new Date(ini);
  d.setDate(d.getDate() + n - 1);
  return d;
}

// ---------------------------------------------------------------------------
// Tentativas de contato — financeiro-original:2935-2972
// ---------------------------------------------------------------------------

/** Lê a lista de tentativas: `extras.tentativasProg` para o programador, a coluna `tentativas` (array) para os demais. */
export function listaTentativas(
  ctx: Contexto,
  registro: Pick<RegistroComHistorico, "tentativas" | "extras">,
): Tentativa[] {
  if (ctx === "prog") return comoListaDeTentativas((registro.extras as ExtrasImplementacao).tentativasProg);
  return comoListaDeTentativas(registro.tentativas);
}

/**
 * Patch para acrescentar uma tentativa — NUNCA espalha a coluna (`{...array}` transformaria a lista em
 * objeto com chaves "0","1",… e destruiria o formato real da coluna; é o defeito B1 da auditoria).
 */
export function patchNovaTentativa(
  ctx: Contexto,
  registro: Pick<RegistroComHistorico, "tentativas" | "extras">,
  tentativa: Tentativa,
): Record<string, unknown> {
  const lista = [...listaTentativas(ctx, registro), tentativa];
  if (ctx === "prog") return { extras: { ...registro.extras, tentativasProg: lista } };
  return { tentativas: lista };
}

export function patchSemTentativa(
  ctx: Contexto,
  registro: Pick<RegistroComHistorico, "tentativas" | "extras">,
  tentativaId: string,
): Record<string, unknown> {
  const lista = listaTentativas(ctx, registro).filter((t) => t.id !== tentativaId);
  if (ctx === "prog") return { extras: { ...registro.extras, tentativasProg: lista } };
  return { tentativas: lista };
}

// ---------------------------------------------------------------------------
// Movimentações impl ⇄ programador — financeiro-original:2251-2268
// devolucoes/entregas/obsParaProg não têm coluna própria: vivem em extras (nomes reais, ver topo do arquivo).
// ---------------------------------------------------------------------------

export function extrasImplementacao(im: Pick<Implementacao, "extras">): ExtrasImplementacao {
  return (im.extras ?? {}) as ExtrasImplementacao;
}

/** Devolve `extras` inteiro com o item acrescentado à lista indicada — pronto para `atualizar()`. */
export function comExtraVolta(
  extrasAtual: Record<string, unknown> | null | undefined,
  chave: "devolucoes" | "entregas",
  item: RegistroVolta,
): Record<string, unknown> {
  const atual = { ...((extrasAtual ?? {}) as ExtrasImplementacao) };
  atual[chave] = [...(atual[chave] ?? []), item];
  return atual;
}

export interface Movimento {
  em: string;
  titulo: string;
  texto?: string | null;
  tom: TomSelo;
}

/** movimentos() — financeiro-original:2251-2261. Só existe para impl/prog (mesma implementação). */
/** Uma passagem de bastão entre etapas, assinada por quem a fez. */
export interface EncaminhamentoRegistrado {
  em: string;
  de: string;
  para: string;
  por?: string | null;
}

const ROTULO_ETAPA: Record<string, string> = {
  clientes: "Clientes",
  implementacao: "Implementação",
  pd: "o P&D",
  suporte: "o Suporte",
};

export function movimentos(im: Implementacao): Movimento[] {
  const extras = extrasImplementacao(im);
  const m: Movimento[] = [];
  // D-1 (Diego, 2026-09-22): "todo encaminhamento tem registro". `extras.encaminhamentos` guarda
  // `{em, de, para, por}` — o "quem", que antes só existia em alguns pontos. O `de/para` vira a frase.
  // O recado ao P&D (`extras.obsParaProg`, artefato :2253) acompanha o último envio ao P&D — antes ele se perdia
  // quando havia registro de "quem" (plano B3, 2026-09-24).
  const encs = ((extras.encaminhamentos as EncaminhamentoRegistrado[] | undefined) ?? []).filter((e) => !!e?.em);
  const ultimoAoPd = encs.map((e) => e.para).lastIndexOf("pd");
  encs.forEach((e, idx) => {
    m.push({
      em: e.em,
      titulo: `${ROTULO_ETAPA[e.de] ?? e.de} enviou para ${ROTULO_ETAPA[e.para] ?? e.para}${e.por ? ` (${e.por})` : ""}`,
      texto: idx === ultimoAoPd ? extras.obsParaProg : undefined,
      tom: "aurora",
    });
  });
  // D-3: quem pegou o atendimento na fila aberta, dos dois lados.
  for (const [chave, rotulo] of [
    ["assumidos", "assumiu a implementação"],
    ["assumidosProg", "assumiu no P&D"],
  ] as const) {
    for (const e of (extras[chave] as Array<{ em?: string; por?: string | null }> | undefined) ?? []) {
      if (!e?.em) continue;
      m.push({ em: e.em, titulo: `${e.por || "Alguém"} ${rotulo}`, tom: "info" });
    }
  }
  // Artefato :2253: o envio sai de `implConcluidoEm`; linhas antigas sem ele usam `enviado_prog_em`.
  const emEnvio = (typeof extras.implConcluidoEm === "string" && extras.implConcluidoEm) || im.enviado_prog_em;
  if (emEnvio && !(extras.encaminhamentos as unknown[] | undefined)?.length) {
    // Linhas antigas, anteriores ao registro de "quem": o carimbo existe, a assinatura não.
    m.push({ em: emEnvio, titulo: "Implementação enviou ao P&D", texto: extras.obsParaProg, tom: "aurora" });
  }
  for (const r of im.retornos ?? []) {
    m.push({ em: r.em, titulo: `Implementação retornou ao programador${r.por ? ` (${r.por})` : ""}`, texto: r.motivo, tom: "aviso" });
  }
  for (const r of extras.devolucoes ?? []) {
    m.push({ em: r.em, titulo: `Programador devolveu à implementação${r.por ? ` (${r.por})` : ""}`, texto: r.motivo, tom: "aviso" });
  }
  // Artefato :2256-2257: sem histórico de entregas, a entrega única vem de progConcluidoEm/obsProgFinal.
  let entregas = extras.entregas ?? [];
  if (!entregas.length && (extras.obsProgFinal || im.prog_concluido_em))
    entregas = [{ em: im.prog_concluido_em ?? "", obs: extras.obsProgFinal }];
  for (const r of entregas) {
    m.push({ em: r.em, titulo: "Programador concluiu e devolveu para validação", texto: r.obs, tom: "ok" });
  }
  if (im.status === "concluida" && im.validado_em) {
    m.push({
      em: im.validado_em,
      titulo: `Teste realizado · enviado ao suporte${im.suporte_responsavel ? ` (${im.suporte_responsavel})` : ""}`,
      texto: im.obs_final,
      tom: "ok",
    });
  }
  return m.filter((x) => !!x.em).sort((a, b) => (a.em < b.em ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Pedidos em aberto do programador — pendenciasProg, financeiro-original:2017-2021
// Lê o diário da IMPLEMENTAÇÃO (não o do programador): é lá que "pedidoProg"/"resolvidoProg" ficam.
// ---------------------------------------------------------------------------

export interface PedidoPendente {
  dia: number;
  data: string;
  texto: string;
}

export function pendenciasProg(diarioImpl: Record<string, DiaRegistro>): PedidoPendente[] {
  const out: PedidoPendente[] = [];
  for (const [chave, dia] of Object.entries(diarioImpl)) {
    if (dia?.pedidoProg && !dia.resolvidoProg) {
      out.push({ dia: Number(chave), data: dia.pedidoProg, texto: dia.pedidos || dia.aguardando || "" });
    }
  }
  return out.sort((a, b) => a.dia - b.dia);
}

// ---------------------------------------------------------------------------
// Estado do atendimento por contexto — iniciado(), ativo() e somente-leitura do diário
// financeiro-original: iniciado (2217-2220), ro (2347)
// ---------------------------------------------------------------------------

/** As 3 tabelas de atendimento (impl/prog dividem `Implementacao`) — usado também pelo gravador compartilhado. */
export type RegistroAtendimento = Implementacao | SuporteAtend | Indicacao;
type RegistroCtx = RegistroAtendimento;

export function inicioDoContexto(ctx: Contexto, r: RegistroCtx): string | null {
  if (ctx === "prog") return (r as Implementacao).prog_inicio;
  return (r as Implementacao | SuporteAtend | Indicacao).inicio ?? null;
}

export function comecouAtendimento(ctx: Contexto, r: RegistroCtx): boolean {
  if (ctx === "ind") return !!(r as Indicacao).iniciado_em;
  if (ctx === "prog") return !!(r as Implementacao).prog_iniciado_em;
  return (r as Implementacao | SuporteAtend).status !== "aguardando";
}

export function atendimentoAtivo(ctx: Contexto, r: RegistroCtx): boolean {
  if (ctx === "ind") return !(r as Indicacao).enviado_vendas_em;
  if (ctx === "prog") return (r as Implementacao).status === "programador";
  const st = (r as Implementacao | SuporteAtend).status;
  return st === "andamento" || st === "validacao";
}

/**
 * Diário somente leitura — financeiro-original:2347. O original zera `ro` para o suporte
 * (`!isSup` na expressão): o diário do suporte nunca trava, mesmo depois de concluído.
 */
export function diarioSomenteLeitura(ctx: Contexto, r: RegistroCtx): boolean {
  if (ctx === "ind") return !!(r as Indicacao).enviado_vendas_em;
  if (ctx === "sup") return false;
  return (r as Implementacao).status === "concluida";
}

// ---------------------------------------------------------------------------
// Nome, status e "quem" por contexto (para o cabeçalho do detalhe e os selects de tentativa)
// ---------------------------------------------------------------------------

export function nomeDoRegistro(ctx: Contexto, r: RegistroCtx, clientes: Cliente[]): string {
  if (ctx === "ind") return (r as Indicacao).lead_nome || "Indicado sem nome";
  const impl = r as Implementacao | SuporteAtend;
  return clientes.find((c) => c.id === impl.cliente_id)?.nome ?? impl.cliente_nome ?? "Cliente removido";
}

const ROTULO_STATUS_IMPL: Record<string, string> = {
  aguardando: "Aguardando início",
  andamento: "Em andamento",
  programador: "Com o P&D",
  validacao: "Em validação · teste e call",
  concluida: "Concluída · no suporte",
};
const TOM_STATUS_IMPL: Record<string, TomSelo> = {
  aguardando: "aviso",
  andamento: "aurora",
  programador: "aviso",
  validacao: "aviso",
  concluida: "ok",
};
const ROTULO_STATUS_SUP: Record<string, string> = {
  aguardando: "Aguardando início",
  andamento: "Em andamento",
  concluida: "Atendimento concluído",
};
const TOM_STATUS_SUP: Record<string, TomSelo> = { aguardando: "aviso", andamento: "aurora", concluida: "ok" };

export function statusDetalhe(ctx: Contexto, r: RegistroCtx): { rotulo: string; tom: TomSelo } {
  if (ctx === "ind") {
    const ind = r as Indicacao;
    if (ind.enviado_vendas_em) return { rotulo: "Enviada para Vendas", tom: "ok" };
    const st = ind.status || "novo";
    const achado = STATUS_INDICACAO.find(([k]) => k === st);
    // cor do status como no artefato (STATUS_IND_PILL, :1073): novo roxo, contato/reunião amarelo, fechou verde
    return { rotulo: achado?.[1] ?? st, tom: TOM_STATUS_INDICACAO[st] ?? "neutro" };
  }
  if (ctx === "sup") return statusSupDe((r as SuporteAtend).status);
  return statusImplDe(r as Implementacao);
}

// ---------------------------------------------------------------------------
// Lote 3/4 (2026-09-24) — o que as listas e o detalhe do artefato mostram, em funções puras (testadas em
// TESTES-CALCULOS/TESTAR-ATENDIMENTO.ts, seção "Lote operação").
//
// Rótulos: os do artefato, com D-2 (a área "Programador" aparece como "P&D"; a PESSOA continua
// "programador"). Tons: p-warn → aviso, p-roxo → aurora, p-ok → ok (REVISAO-VISUAL-CORES.md #44-#45).
// ---------------------------------------------------------------------------

/** statusImplDe — artefato :1930-1936. */
export function statusImplDe(
  im: Pick<Implementacao, "status" | "prog_iniciado_em" | "retornos" | "ultima_volta">,
): { rotulo: string; tom: TomSelo } {
  if (im.status === "programador") {
    if (!im.prog_iniciado_em) return { rotulo: "Aguardando P&D", tom: "aviso" };
    return { rotulo: (im.retornos ?? []).length ? "P&D · retornado" : "P&D em andamento", tom: "aurora" };
  }
  if (im.status === "validacao")
    return im.ultima_volta === "devolucao"
      ? { rotulo: "Devolvido pelo P&D", tom: "aviso" }
      : { rotulo: "Em validação · teste e call", tom: "aviso" };
  return {
    rotulo: ROTULO_STATUS_IMPL[im.status ?? ""] ?? ROTULO_STATUS_IMPL.aguardando,
    tom: TOM_STATUS_IMPL[im.status ?? ""] ?? TOM_STATUS_IMPL.aguardando,
  };
}

/** STATUS_SUP — artefato :1983 (sem status conhecido, vale "aguardando", como `||STATUS_SUP.aguardando`). */
export function statusSupDe(status: string | null | undefined): { rotulo: string; tom: TomSelo } {
  const s = status && status in ROTULO_STATUS_SUP ? status : "aguardando";
  return { rotulo: ROTULO_STATUS_SUP[s], tom: TOM_STATUS_SUP[s] };
}

/** Selo da reunião — artefato `statusReuPill` :574 (Agendada roxo, Remarcada amarelo). */
export function tomReuniao(st: string | null | undefined): TomSelo {
  if (st === "Concluída") return "ok";
  if (st === "Cancelada") return "erro";
  if (st === "Remarcada") return "aviso";
  return "aurora";
}

export const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** diaSemana — artefato :583 ("AAAA-MM-DD" → "segunda"). */
export function diaSemana(s: string | null | undefined): string {
  const d = parseData(s);
  return d ? DIAS_SEMANA[d.getDay()] : "";
}

const p2 = (n: number): string => String(n).padStart(2, "0");

/** isoParaBR — artefato :1958 ("AAAA-MM-DD" → "dd/mm/aaaa"; vazio → ""). */
export function isoParaBR(s: string | null | undefined): string {
  const d = parseData(s);
  return d ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` : "";
}

/** dataHoraBR do artefato (:1952): "dd/mm/aaaa às hh:mm"; sem valor → "—". */
export function dataHoraAs(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} às ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** hojeBR/agoraHM do artefato (:1956-1957), para preencher os campos de data e hora. */
export const hojeBR = (agora: Date = new Date()): string =>
  `${p2(agora.getDate())}/${p2(agora.getMonth() + 1)}/${agora.getFullYear()}`;
export const agoraHM = (agora: Date = new Date()): string => `${p2(agora.getHours())}:${p2(agora.getMinutes())}`;

/** Tentativa: data (ISO) + hora (hh:mm) digitadas → instante, no fuso do navegador (artefato :2955-2956). */
export function quandoTentativa(dataIso: string, hora: string): string {
  const [a, m, d] = dataIso.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  return new Date(a, m - 1, d, h, mi).toISOString();
}

/** norm — artefato :1076: sem acento, minúsculo, espaços simples. */
export function normalizarBusca(t: unknown): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface AndamentoLista {
  /** Dia atual (0 = sem início). */
  dia: number;
  passou: boolean;
  /** "Dia X de 15" ou "Passou dos 15 dias (dia N)" — artefato :2119. */
  texto: string;
  /** 0-100, para a barra. */
  pct: number;
}

/** Coluna "Andamento" das listas (artefato :2117-2121 e :2754-2758). */
export function andamentoLista(inicioIso: string | null | undefined, hoje: Date): AndamentoLista {
  const dia = diaAtualDe(inicioIso, hoje);
  const passou = dia > DIAS_ATENDIMENTO;
  const pct = Math.max(0, Math.min(100, Math.round((Math.min(dia, DIAS_ATENDIMENTO) / DIAS_ATENDIMENTO) * 100)));
  const texto = passou
    ? `Passou dos ${DIAS_ATENDIMENTO} dias (dia ${dia})`
    : `Dia ${Math.max(dia, 1)} de ${DIAS_ATENDIMENTO}`;
  return { dia, passou, texto, pct };
}

type ReuMin = { id: string; status: string | null; data: string | null; hora: string | null };
const ordemReu = (a: ReuMin, b: ReuMin): number => {
  const x = `${a.data || ""} ${a.hora || ""}`;
  const y = `${b.data || ""} ${b.hora || ""}`;
  return x < y ? -1 : x > y ? 1 : 0;
};

/** proxReuImpl — artefato :1979-1982: a próxima reunião AGENDADA da implementação (sem as do P&D e de indicação). */
export function proximaReuniaoImpl(implReunioes: ImplReuniao[], implId: string, h0: string): ImplReuniao | null {
  return (
    implReunioes
      .filter(
        (r) =>
          r.impl_id === implId && r.area !== "prog" && r.area !== "ind" && r.status === "Agendada" && (r.data ?? "") >= h0,
      )
      .sort(ordemReu)[0] ?? null
  );
}

/** Próxima reunião do suporte — artefato :2760-2762: a do atendimento; se não houver, a do cliente. */
export function proximaReuniaoSup(
  reunioes: Reuniao[],
  atendId: string | null,
  clienteId: string | null,
  h0: string,
): Reuniao | null {
  const agendadas = reunioes.filter((r) => r.status === "Agendada" && (r.data ?? "") >= h0).sort(ordemReu);
  return (
    (atendId ? agendadas.find((r) => r.atend_id === atendId) : undefined) ??
    agendadas.find((r) => !!clienteId && r.cliente_id === clienteId) ??
    null
  );
}

/** Nome do cliente da implementação (artefato: `c?c.nome:(i.clienteNome||"Cliente removido")`). */
export function nomeClienteImpl(
  i: { cliente_id: string | null; cliente_nome: string | null },
  clientes: Cliente[],
): string {
  return clientes.find((c) => c.id === i.cliente_id)?.nome ?? (i.cliente_nome || "Cliente removido");
}

// ---- Lista da Implementação — artefato viewImplementacao :2054-2090 ----------------------------------

/** Implementações que a aba mostra: as concluídas escondidas do histórico (`ocultoImpl`) saem (:2056). */
export const implementacoesVisiveis = (lista: Implementacao[]): Implementacao[] =>
  lista.filter((i) => !(i.oculto_impl && i.status === "concluida"));

export interface FiltroLista {
  /** Chip de status: "ativos", "todos" ou um status. */
  status: string;
  /** "todos", "sem" ou um nome. */
  resp: string;
  /** Texto da busca. */
  q: string;
}

export function listaImplementacao(todas: Implementacao[], clientes: Cliente[], f: FiltroLista): Implementacao[] {
  const q = normalizarBusca(f.q);
  const ordem: Record<string, number> = { validacao: 0, aguardando: 1, andamento: 2, programador: 3, concluida: 4 };
  return todas
    .filter((i) => {
      if (f.status === "ativos" && i.status === "concluida") return false;
      if (f.status !== "ativos" && f.status !== "todos" && i.status !== f.status) return false;
      if (f.resp === "sem" && i.responsavel) return false;
      if (f.resp !== "todos" && f.resp !== "sem" && i.responsavel !== f.resp) return false;
      if (q) {
        const c = clientes.find((x) => x.id === i.cliente_id);
        if (normalizarBusca([c ? c.nome : i.cliente_nome, c?.email, i.responsavel].join(" ")).indexOf(q) < 0) return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        (ordem[a.status ?? ""] ?? 0) - (ordem[b.status ?? ""] ?? 0) || ((a.enviado_em ?? "") < (b.enviado_em ?? "") ? -1 : 1),
    );
}

// ---- Lista do P&D — artefato viewProgramador :2482-2517 -----------------------------------------------

/** Some o que o P&D escondeu dos concluídos (`ocultoProg`, :2484). */
export const programadorVisiveis = (lista: Implementacao[]): Implementacao[] =>
  lista.filter((i) => !(i.oculto_prog && (i.status === "concluida" || i.status === "validacao")));

export function listaProgramador(todas: Implementacao[], clientes: Cliente[], f: FiltroLista): Implementacao[] {
  const q = normalizarBusca(f.q);
  const fechado = (i: Implementacao) => i.status === "concluida" || i.status === "validacao";
  return todas
    .filter((i) => {
      if (f.status === "programador" && i.status !== "programador") return false;
      if (f.status === "implementacao" && !(i.status === "andamento" || i.status === "aguardando")) return false;
      if (f.status === "pedidos" && (i.status === "concluida" || !pendenciasProg(diarioDoContexto("impl", i)).length))
        return false;
      if (f.status === "concluida" && !fechado(i)) return false;
      if (f.resp === "sem" && i.programador) return false;
      if (f.resp !== "todos" && f.resp !== "sem" && i.programador !== f.resp) return false;
      if (q) {
        const c = clientes.find((x) => x.id === i.cliente_id);
        if (normalizarBusca([c ? c.nome : i.cliente_nome, i.responsavel, i.programador].join(" ")).indexOf(q) < 0) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Mesma comparação do artefato (:2513-2516), inclusive a assimetria entre concluídos e abertos.
      const x = fechado(a) ? (b.prog_concluido_em || b.concluido_em || "") : (a.enviado_prog_em || a.enviado_em || "");
      const y = fechado(a) ? (a.prog_concluido_em || a.concluido_em || "") : (b.enviado_prog_em || b.enviado_em || "");
      return x < y ? -1 : x > y ? 1 : 0;
    });
}

// ---- Suporte: clientes recebidos da implementação — artefato painelSuporteRecebidos :2714-2732 --------

export interface LinhaSuporte {
  /** Implementação de origem; null só para atendimento órfão (sem implementação conhecida). */
  im: Implementacao | null;
  at: SuporteAtend | null;
  status: "aguardando" | "andamento" | "concluida";
  resp: string;
  recebido: string | null;
  clienteId: string | null;
}

/** atendDaImpl — artefato :1991 (`sa-<id>`): aqui, o atendimento com `impl_id` desta implementação. */
export const atendimentoDaImpl = (suporteAtend: SuporteAtend[], implId: string): SuporteAtend | null =>
  suporteAtend.find((a) => a.impl_id === implId) ?? null;

const statusSup = (s: string | null | undefined): LinhaSuporte["status"] =>
  s === "andamento" || s === "concluida" ? s : "aguardando";

/**
 * Uma linha por implementação concluída e não excluída do suporte, com o atendimento dela (se já existir).
 * Proteção do app, fora do artefato: atendimento que não tem implementação nenhuma (dado antigo) também entra,
 * para não sumir da tela.
 */
export function linhasSuporte(implementacoes: Implementacao[], suporteAtend: SuporteAtend[]): LinhaSuporte[] {
  const linhas: LinhaSuporte[] = implementacoes
    .filter((i) => i.status === "concluida" && !i.suporte_removido)
    .map((i) => {
      const at = atendimentoDaImpl(suporteAtend, i.id);
      return {
        im: i,
        at,
        status: at ? statusSup(at.status) : "aguardando",
        resp: at ? at.responsavel || "" : i.suporte_responsavel || "",
        recebido: at ? at.enviado_em : i.concluido_em,
        clienteId: i.cliente_id,
      };
    });
  const idsImpl = new Set(implementacoes.map((i) => i.id));
  for (const at of suporteAtend) {
    if (at.impl_id && idsImpl.has(at.impl_id)) continue;
    linhas.push({ im: null, at, status: statusSup(at.status), resp: at.responsavel || "", recebido: at.enviado_em, clienteId: at.cliente_id });
  }
  return linhas;
}

export function filtrarLinhasSuporte(linhas: LinhaSuporte[], status: string, cliente: string): LinhaSuporte[] {
  const ordem = { aguardando: 0, andamento: 1, concluida: 2 };
  return linhas
    .filter((l) => {
      if (cliente !== "todos" && l.clienteId !== cliente) return false;
      if (status === "ativos") return l.status !== "concluida";
      if (status !== "todos") return l.status === status;
      return true;
    })
    .sort((x, y) => ordem[x.status] - ordem[y.status] || ((x.recebido ?? "") < (y.recebido ?? "") ? 1 : -1));
}

/** Quantos clientes cada pessoa da equipe tem (pílulas "Nome · N", artefato :2737-2739). */
export function clientesPorPessoa(linhas: LinhaSuporte[]): Record<string, number> {
  const por: Record<string, number> = {};
  for (const l of linhas) if (l.resp) por[l.resp] = (por[l.resp] ?? 0) + 1;
  return por;
}

/** "Reabrir em validação" só apaga o atendimento de suporte se ninguém mexeu nele ainda (artefato :3170-3172). */
export const atendimentoIntocado = (sa: Pick<SuporteAtend, "status" | "tentativas">): boolean =>
  sa.status === "aguardando" && !(Array.isArray(sa.tentativas) && sa.tentativas.length);

/** Funcionários ativos de uma área, por nome (artefato `nomesFuncionarios` :1941-1945). */
export function nomesDaArea(funcionarios: Dados["funcionarios"], area: "implementacao" | "programador"): string[] {
  return funcionarios
    .filter((f) => f.ativo !== false && ((f.area === "programador" ? "programador" : "implementacao") === area))
    .map((f) => f.nome)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** "Clientes em aberto" por pessoa na tabela de funcionários (artefato :2163-2164). */
export function abertosPorPessoa(implementacoes: Implementacao[], campo: "responsavel" | "programador"): Record<string, number> {
  const por: Record<string, number> = {};
  for (const i of implementacoes) {
    const n = i[campo];
    if (i.status !== "concluida" && n) por[n] = (por[n] ?? 0) + 1;
  }
  return por;
}

/**
 * nomes() de CTX_ATEND — financeiro-original:2183,2190,2198,2205. Duplica a lógica de
 * equipeSuporte()/nomesFuncionarios() já repetida em aba-implementacao.tsx e aba-suporte.tsx
 * (comentário deles: "deveria subir para calculos.ts"). Mantido aqui para não criar mais uma
 * dependência cruzada entre abas; consolidar é dívida pré-existente, não deste lote.
 */
export function nomesContexto(
  ctx: Contexto,
  dados: Pick<Dados, "funcionarios" | "config" | "vendedores">,
): string[] {
  if (ctx === "prog") {
    return dados.funcionarios
      .filter((f) => f.ativo !== false && (f.area ?? "implementacao") === "programador")
      .map((f) => f.nome)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }
  if (ctx === "sup") {
    const pessoas = (dados.config.equipe as { pessoas?: unknown } | undefined)?.pessoas;
    return Array.isArray(pessoas) ? pessoas.filter((n): n is string => typeof n === "string" && n.length > 0) : [];
  }
  if (ctx === "ind") {
    const ativos = dados.vendedores.filter((v) => v.ativo !== false);
    const internos = ativos.filter((v) => (v.tipo ?? "interno") === "interno");
    return (internos.length ? internos : ativos).map((v) => v.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }
  return dados.funcionarios
    .filter((f) => f.ativo !== false && (f.area ?? "implementacao") === "implementacao")
    .map((f) => f.nome)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ---------------------------------------------------------------------------
// Reuniões do atendimento (item 8) — financeiro-original:2374-2377
// ---------------------------------------------------------------------------

export function reunioesDoAtendimento(
  ctx: Contexto,
  id: string,
  dados: Pick<Dados, "implReunioes" | "reunioes">,
): Array<ImplReuniao | Reuniao> {
  if (ctx === "sup") return dados.reunioes.filter((r) => r.atend_id === id);
  return dados.implReunioes.filter((r) => {
    if (r.impl_id !== id) return false;
    if (ctx === "prog") return r.area === "prog";
    if (ctx === "ind") return r.area === "ind";
    return r.area !== "prog" && r.area !== "ind";
  });
}

export const ROTULO_REUNIOES: Record<Contexto, string> = {
  impl: "Reuniões de implementação",
  prog: "Reuniões do P&D",
  sup: "Reuniões de alinhamento",
  ind: "Reuniões com o indicado",
};

// ---------------------------------------------------------------------------
// Gravador compartilhado do detalhe do atendimento — corrige B7 (auditoria, rodada 2, 2026-09-22).
//
// B4 (rodada 1) resolveu dois `onBlur` do MESMO painel se atropelarem, com um `ref` por painel alimentado
// só pelas próprias gravações. B7 apareceu porque, no contexto "prog", diário e tentativas gravam na MESMA
// coluna (`extras`) mas cada painel tinha o seu `ref` — o do diário nunca via o que o de tentativas acabava
// de gravar (e vice-versa), então a gravação seguinte partia de um retrato velho e apagava a mais recente.
//
// A correção: um gravador só, por tela aberta, compartilhado por todos os painéis que escrevem naquele
// registro. `gravar()` sempre parte do último retrato CONFIRMADO pelo banco (o que a gravação anterior
// devolveu), nunca de uma prop; e enfileira (`fila`) para duas gravações da mesma tela nunca rodarem sobre
// o mesmo snapshot ao mesmo tempo, venham elas do diário, de uma tentativa ou de outra gravação futura.
// `sincronizar()` é chamado pelo componente sempre que a prop `registro` muda (depois de QUALQUER
// `recarregar()`, inclusive o disparado por tempo real de outra pessoa) — é o que mantém A1 sob controle
// enquanto não houver gravação em voo; ver ressalva no PROGRESSO-LOTE-H.md sobre o que isso NÃO resolve.
//
// Função pura (nenhum `atualizar`/DB aqui: quem grava de verdade é a `fn` que o chamador passa), por isso
// testável direto pelo `node` — ver TESTES-CALCULOS/TESTAR-ATENDIMENTO.ts.
// ---------------------------------------------------------------------------

export interface GravadorAtendimento<R> {
  /** Último retrato conhecido (o que a última gravação confirmada devolveu, ou a última prop sincronizada). */
  obterAtual: () => R;
  /** Chamar quando a prop `registro` mudar (nunca no meio de uma gravação: só reflete o que já chegou). */
  sincronizar: (novo: R) => void;
  /**
   * Enfileira `fn` para rodar depois que a gravação anterior desta tela terminar (sucesso ou erro), sempre
   * com o retrato mais recente. Em sucesso, mescla o que `fn` devolveu (a linha do banco) no retrato atual.
   */
  gravar: (fn: (atual: R) => Promise<Record<string, unknown>>) => Promise<Record<string, unknown>>;
}

/**
 * Carimbo do servidor (gatilho `gestao_toca_atualizado`, presente em toda tabela da gestão). Registro que
 * nunca voltou do banco, ou com carimbo ilegível, vale 0 — nunca vence um retrato já confirmado.
 */
const carimboDe = (r: object): number => {
  const bruto = (r as { atualizado_em?: string }).atualizado_em;
  const t = bruto ? Date.parse(bruto) : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
};

export function criarGravadorAtendimento<R extends object>(inicial: R): GravadorAtendimento<R> {
  let atual = inicial;
  let fila: Promise<void> = Promise.resolve();
  return {
    obterAtual: () => atual,
    // B8 (auditoria, rodada 3): `recarregar()` roda FORA da fila, então o SELECT dele pode responder
    // depois de uma gravação mais nova já ter commitado, trazendo a foto velha. Aceitá-la faria a
    // gravação seguinte partir dela e apagar o campo do meio — depois de a tela ter dito "Salvo".
    // Quem decide é o carimbo do servidor, não a ordem de chegada das respostas.
    sincronizar: (novo) => {
      if (carimboDe(novo) < carimboDe(atual)) return;
      atual = novo;
    },
    gravar: (fn) => {
      const tarefa = fila.then(() => fn(atual)).then((linha) => {
        atual = { ...atual, ...linha } as R;
        return linha;
      });
      // a fila sempre resolve (nunca rejeita), para a PRÓXIMA gravação rodar mesmo se esta falhou;
      // quem chamou `gravar` ainda recebe o erro de `tarefa` normalmente (await/catch funcionam).
      fila = tarefa.then(
        () => undefined,
        () => undefined,
      );
      return tarefa;
    },
  };
}

// ---------------------------------------------------------------------------
// Pendências da operação — artefato `pendenciasOperacao` :3490.
// O painel que abre a aba Tarefas do time dizendo o que está parado AGORA, sem ninguém ter
// digitado nada: sai do próprio estado das implementações, das reuniões e das atas.
// Cada pendência tem uma `chave` estável, para virar tarefa uma vez só (`gestao_tarefas.origem_key`).
// ---------------------------------------------------------------------------

export type PrioridadePendencia = "alta" | "media" | "baixa";

export interface Pendencia {
  /** Estável e única: é o que liga a pendência à tarefa já criada (artefato :3548). */
  chave: string;
  titulo: string;
  detalhe: string;
  /** Nome do cliente (ou "Equipe"). */
  cliente: string;
  area: string;
  /** Quem deveria resolver; vazio quando ninguém assumiu. */
  responsavel: string;
  prioridade: PrioridadePendencia;
  /** Implementação de origem, quando houver — para o botão "Abrir". */
  implId?: string;
}

const diasDesdeIso = (iso: string | null | undefined, hoje: Date): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.floor((hoje.getTime() - t) / 86400000);
};

const PESO_PRIORIDADE: Record<PrioridadePendencia, number> = { alta: 0, media: 1, baixa: 2 };

/**
 * Tudo que está pendente na operação, na ordem do artefato (:3550): primeiro o que ainda não virou
 * tarefa, depois por prioridade. `hoje` entra por parâmetro para o teste poder fixar o relógio.
 */
export function pendenciasOperacao(dados: Dados, hoje: Date): Pendencia[] {
  const fora: Pendencia[] = [];
  const h0 = ymd(hoje);
  const nomeCliente = (id: string | null, reserva?: string | null): string =>
    dados.clientes.find((c) => c.id === id)?.nome ?? reserva ?? "Cliente";

  for (const i of dados.implementacoes) {
    if (i.status === "concluida") continue;
    const base = { cliente: nomeCliente(i.cliente_id, i.cliente_nome), implId: i.id, area: "implementacao" };

    if (i.status === "aguardando") {
      if (!i.responsavel) {
        fora.push({
          ...base,
          chave: `impl-semresp:${i.id}`,
          titulo: "Definir responsável pela implementação",
          detalhe: `Na fila desde ${dataBR(i.enviado_em?.slice(0, 10) ?? null)}`,
          responsavel: "",
          prioridade: "alta",
        });
      } else if (listaTentativas("impl", i).length === 0 && diasDesdeIso(i.enviado_em, hoje) >= 2) {
        fora.push({
          ...base,
          chave: `impl-contato:${i.id}`,
          titulo: "Fazer o primeiro contato",
          detalhe: `Na fila há ${diasDesdeIso(i.enviado_em, hoje)} dias sem tentativa de contato`,
          responsavel: i.responsavel,
          prioridade: "alta",
        });
      }
    }

    if (i.status === "andamento") {
      const diaAtual = diaAtualDe(i.iniciado_em, hoje);
      const diario = diarioDoContexto("impl", i);
      const ultimo = Object.keys(diario)
        .filter((k) => diaTemRegistro(diario[k]))
        .map(Number)
        .reduce((a, b) => Math.max(a, b), 0);
      if (diaAtual > DIAS_ATENDIMENTO) {
        fora.push({
          ...base,
          chave: `impl-prazo:${i.id}`,
          titulo: `Prazo de ${DIAS_ATENDIMENTO} dias estourado`,
          detalhe: `Hoje é o dia ${diaAtual} da implementação`,
          responsavel: i.responsavel ?? "",
          prioridade: "alta",
        });
      } else if (diaAtual >= 3 && diaAtual - ultimo >= 2) {
        fora.push({
          ...base,
          chave: `impl-registro:${i.id}:${diaAtual}`,
          titulo: "Registrar o andamento",
          detalhe: `${ultimo ? `Último registro no dia ${ultimo}` : "Nenhum dia registrado"} · hoje é o dia ${diaAtual}`,
          responsavel: i.responsavel ?? "",
          prioridade: "media",
        });
      }
    }

    if (i.status === "programador") {
      if (!i.prog_iniciado_em && diasDesdeIso(i.enviado_prog_em, hoje) >= 1) {
        fora.push({
          ...base,
          area: "programador",
          chave: `prog-parado:${i.id}`,
          titulo: "P&D ainda não iniciou",
          detalhe: `Enviado há ${diasDesdeIso(i.enviado_prog_em, hoje)} dia(s)`,
          responsavel: i.programador ?? "",
          prioridade: "media",
        });
      }
      const pedidos = pendenciasProg(diarioDoContexto("impl", i)).length;
      if (pedidos > 0) {
        fora.push({
          ...base,
          chave: `prog-pedidos:${i.id}:${pedidos}`,
          titulo: `${pedidos} ${pedidos > 1 ? "pedidos" : "pedido"} do P&D em aberto`,
          detalhe: "Responder para o P&D seguir",
          responsavel: i.responsavel ?? "",
          prioridade: "media",
        });
      }
    }

    if (i.status === "validacao") {
      fora.push({
        ...base,
        chave: `impl-validar:${i.id}:${(i.retornos ?? []).length}`,
        titulo: i.ultima_volta === "devolucao" ? "Resolver a devolução do P&D" : "Testar e fazer a call com o cliente",
        detalhe: `Em validação desde ${dataBR((i.validacao_desde ?? i.prog_concluido_em)?.slice(0, 10) ?? null)}`,
        responsavel: i.responsavel ?? "",
        prioridade: "alta",
      });
    }
  }

  // Reuniões que passaram e seguem agendadas, ou que foram concluídas sem relato (artefato :3521-3538).
  const deReunioes = (
    lista: Array<{ id: string; status: string | null; data: string | null; hora: string | null; tipo: string | null; resumo: string | null; responsavel: string | null; cliente_id: string | null; area?: string | null; impl_id?: string | null }>,
    colecao: "reunioes" | "implReunioes",
  ) => {
    for (const r of lista) {
      const vencida = r.status === "Agendada" && !!r.data && r.data < h0;
      const semRelato = r.status === "Concluída" && !(r.resumo ?? "").trim();
      if (!vencida && !semRelato) continue;
      const area =
        colecao === "reunioes"
          ? "suporte"
          : r.area === "prog"
            ? "programador"
            : r.area === "ind"
              ? "comercial"
              : "implementacao";
      fora.push({
        chave: `${vencida ? "reu-vencida" : "reu-relato"}:${colecao}:${r.id}`,
        titulo: vencida ? "Reunião passou e segue agendada" : "Preencher o relato da reunião",
        detalhe: `${r.tipo || "Reunião"} · ${dataBR(r.data)}${r.hora ? ` ${r.hora}` : ""}`,
        cliente: nomeCliente(r.cliente_id),
        area,
        responsavel: r.responsavel ?? "",
        prioridade: "media",
        ...(colecao === "implReunioes" && r.impl_id ? { implId: r.impl_id } : {}),
      });
    }
  };
  deReunioes(dados.reunioes, "reunioes");
  deReunioes(dados.implReunioes, "implReunioes");

  for (const r of dados.reunioesEquipe) {
    const primeiro = (r.participantes ?? [])[0] ?? "";
    if (r.status === "Concluída" && !(r.ata ?? "").trim()) {
      fora.push({
        chave: `eq-ata:${r.id}`,
        titulo: "Registrar a ata da reunião",
        detalhe: `${r.titulo || r.tipo || "Reunião da equipe"} · ${dataBR(r.data)}`,
        cliente: "Equipe",
        area: "geral",
        responsavel: primeiro,
        prioridade: "media",
      });
    } else if (r.status === "Agendada" && !!r.data && r.data < h0) {
      fora.push({
        chave: `eq-vencida:${r.id}`,
        titulo: "Reunião da equipe passou e segue agendada",
        detalhe: `${r.titulo || r.tipo || "Reunião"} · ${dataBR(r.data)}`,
        cliente: "Equipe",
        area: "geral",
        responsavel: primeiro,
        prioridade: "media",
      });
    }
  }

  const jaViraramTarefa = new Set(dados.tarefas.map((t) => t.origem_key).filter(Boolean));
  return fora.sort((a, b) => {
    const ta = jaViraramTarefa.has(a.chave) ? 1 : 0;
    const tb = jaViraramTarefa.has(b.chave) ? 1 : 0;
    return ta - tb || PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
  });
}

/** A pendência já virou tarefa? (artefato :3548, por `origem_key`). */
export const pendenciaJaTemTarefa = (dados: Dados, chave: string): Tarefa | null =>
  dados.tarefas.find((t) => t.origem_key === chave) ?? null;
