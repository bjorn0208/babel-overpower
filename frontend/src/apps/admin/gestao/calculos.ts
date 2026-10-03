/**
 * Cálculos do app Gestão: faturamento, previsão, mensalidades, MRR, atrasos, atividade e séries de gráfico.
 *
 * PORTE do app original (nova-peca-gerencia/1-financeiro-novo/financeiro.html, linhas 469-583 e 698-830),
 * já com as decisões do Theus (2026-09-21). Cada trecho cita a linha do original.
 * Funções PURAS: recebem os dados e o "hoje", não leem o relógio, não tocam no banco.
 * Provado por app-gestao/TESTES-CALCULOS (contra o original rodando de verdade).
 *
 * Diferenças deliberadas em relação ao original (uma linha por decisão):
 *  D1  mensalidades sem corte de 12 meses: seguem enquanto o cliente estiver ativo (competencias()).
 *  D2  cancelar mantém o histórico pago; corta só as futuras não pagas (competencias()).
 *  D4  indicação conta pelo dia de calendário `data_indicacao`, sem deslocar por fuso (diaDaIndicacao()).
 *  D8  atividade vem do uso real + o digitado por cima (atividadeDeUso()); o original só via o digitado.
 *  (D3, D5, D6, D11, D12, D14 são de gravação e estão em dados.ts.)
 */

import {
  addMeses,
  inicioDoMes,
  mesParaData,
  parseData,
  ym,
  ymd,
  type AtividadeFinal,
  type AtividadeUso,
  type Cliente,
  type Indicacao,
  type Mensalidade,
  type Parcela,
  type Reuniao,
  STATUS_INDICACAO,
  type Dados,
  type Tarefa,
} from "./tipos";

const DIA_MS = 86_400_000;

/** Dias de folga: passou de 3 dias do vencimento = atrasado (statusVenc, original :492). */
export const DIAS_DE_CARENCIA = 3;

const numero = (v: number | string | null | undefined): number => Number(v) || 0;
const diasAte = (venc: Date, hoje: Date): number =>
  Math.round((venc.getTime() - hoje.getTime()) / DIA_MS);

// ---------------------------------------------------------------------------
// Modelo derivado (original :470-498)
// ---------------------------------------------------------------------------

/** ativo(c) — original :471. "Sem plano" conta como ativo; só "Cancelado" sai. */
export const ativo = (c: Pick<Cliente, "situacao">): boolean => c.situacao !== "Cancelado";

/** mrr() — original :472. Soma a mensalidade dos clientes ativos. */
export function mrr(clientes: Cliente[]): number {
  let t = 0;
  for (const c of clientes) if (ativo(c)) t += numero(c.mensalidade);
  return t;
}

export interface Competencia {
  /** `${cliente_id}__${n}` — mesma chave do original. */
  chave: string;
  clienteId: string;
  cliente: string;
  n: number;
  venc: Date;
  previsto: number;
  pago: Date | null;
  recebido: number;
}

/**
 * Todas as competências de mensalidade (previstas), com o pagamento quando houver.
 * Original: :475-488. Mudanças D1 e D2 (patches 01 e 02 de plano-integracao/PATCHES-LOGICA-APP):
 *  - sem CICLO=12: gera até 12 meses depois do mês mais adiante que a tela pode pedir (o mês do topo ou hoje);
 *    uma competência JÁ PAGA além disso continua aparecendo;
 *  - cliente Cancelado: o pago e o já vencido ficam; só as futuras não pagas deixam de existir.
 */
export function competencias(
  clientes: Cliente[],
  mensalidades: Mensalidade[],
  mes: string,
  hoje: Date,
): Competencia[] {
  const out: Competencia[] = [];
  const mapa = new Map<string, Mensalidade>();
  for (const p of mensalidades) mapa.set(`${p.cliente_id}__${p.n}`, p);
  const ref = mesParaData(mes);
  const horizonte = addMeses(inicioDoMes(ref > hoje ? ref : hoje), 12);
  for (const c of clientes) {
    const ini = parseData(c.inicio_cobranca);
    const val = numero(c.mensalidade);
    if (!ini || !val) continue;
    for (let n = 1; n <= 9999; n++) {
      // 9999 = teto do CHECK de gestao_mensalidades.n (03-GESTAO.sql:47)
      const venc = addMeses(ini, n - 1);
      const chave = `${c.id}__${n}`;
      const pg = mapa.get(chave);
      const pago = !!(pg && pg.pago_em);
      if (venc > horizonte && !pago) break;
      if (!ativo(c) && venc > hoje && !pago) continue;
      out.push({
        chave,
        clienteId: c.id,
        cliente: c.nome,
        n,
        venc,
        previsto: val,
        pago: pago ? parseData(pg!.pago_em) : null,
        recebido: pago ? (pg!.valor_recebido != null ? numero(pg!.valor_recebido) : val) : 0,
      });
    }
  }
  return out;
}

export type StatusVenc = "pago" | "atrasado" | "carencia" | "breve" | "emdia";

export const ROTULO_STATUS: Record<StatusVenc, string> = {
  pago: "Pago",
  atrasado: "Atrasado",
  carencia: "Em carência",
  breve: "Vence em breve",
  emdia: "Em dia",
};

/** Classe de selo por status (badge-* de bundle.css:199-202). O original usava p-ok/p-crit/p-warn/p-neutral. */
export const SELO_STATUS: Record<StatusVenc, string> = {
  pago: "badge badge-success",
  atrasado: "badge badge-err",
  carencia: "badge badge-warn",
  breve: "badge badge-warn",
  emdia: "badge",
};

/** statusVenc — original :489-496. */
export function statusVenc(venc: Date, pago: boolean | Date | null, hoje: Date): StatusVenc {
  if (pago) return "pago";
  const diff = diasAte(venc, hoje);
  if (diff < -DIAS_DE_CARENCIA) return "atrasado";
  if (diff < 0) return "carencia";
  if (diff <= 5) return "breve";
  return "emdia";
}

// ---------------------------------------------------------------------------
// Séries e resumo do Painel (original :500-545)
// ---------------------------------------------------------------------------

export interface DadosFinanceiros {
  clientes: Cliente[];
  parcelas: Parcela[];
  mensalidades: Mensalidade[];
}

export interface PontoMes {
  mes: Date;
  chave: string;
  setupReal: number;
  mensReal: number;
  setupPrev: number;
  mensPrev: number;
  total: number;
}

/** serieMes — original :500-518. `base` é o mês de referência (YYYY-MM). */
export function serieMes(
  base: string,
  back: number,
  fwd: number,
  d: DadosFinanceiros,
  hoje: Date,
): PontoMes[] {
  const ini = inicioDoMes(mesParaData(base));
  const comp = competencias(d.clientes, d.mensalidades, base, hoje);
  const out: PontoMes[] = [];
  for (let i = -back; i <= fwd; i++) {
    const m = addMeses(ini, i);
    const k = ym(m);
    const o: PontoMes = {
      mes: m,
      chave: k,
      setupReal: 0,
      mensReal: 0,
      setupPrev: 0,
      mensPrev: 0,
      total: 0,
    };
    for (const p of d.parcelas) {
      const v = numero(p.valor);
      if (!v) continue;
      if (p.pago_em && ym(parseData(p.pago_em)) === k) o.setupReal += v;
      else if (!p.pago_em && p.vencimento && ym(parseData(p.vencimento)) === k) o.setupPrev += v;
    }
    for (const c of comp) {
      if (c.pago && ym(c.pago) === k) o.mensReal += c.recebido;
      else if (!c.pago && ym(c.venc) === k) o.mensPrev += c.previsto;
    }
    o.total = o.setupReal + o.mensReal + o.setupPrev + o.mensPrev;
    out.push(o);
  }
  return out;
}

export interface ResumoPainel {
  fatSetup: number;
  fatMens: number;
  setupReceber: number;
  setupProx: number;
  mensReceber: number;
  mensRecebida: number;
  atrasoQtd: number;
  atrasoValor: number;
  mrr: number;
  clientesAtivos: number;
  novos: number;
  faturamento: number;
  previsibilidade: number;
}

/** resumo — original :519-545. */
export function resumo(mes: string, d: DadosFinanceiros, hoje: Date): ResumoPainel {
  const ref = mesParaData(mes);
  const k = ym(ref);
  const kn = ym(addMeses(ref, 1));
  const comp = competencias(d.clientes, d.mensalidades, mes, hoje);
  const r: ResumoPainel = {
    fatSetup: 0,
    fatMens: 0,
    setupReceber: 0,
    setupProx: 0,
    mensReceber: 0,
    mensRecebida: 0,
    atrasoQtd: 0,
    atrasoValor: 0,
    mrr: mrr(d.clientes),
    clientesAtivos: 0,
    novos: 0,
    faturamento: 0,
    previsibilidade: 0,
  };
  for (const c of d.clientes) {
    if (ativo(c)) r.clientesAtivos++;
    if (c.fechamento && ym(parseData(c.fechamento)) === k) r.novos++;
  }
  for (const p of d.parcelas) {
    const v = numero(p.valor);
    if (!v) continue;
    const pg = parseData(p.pago_em);
    const vc = parseData(p.vencimento);
    if (pg && ym(pg) === k) r.fatSetup += v;
    if (!pg && vc) {
      if (ym(vc) === k) r.setupReceber += v;
      if (ym(vc) === kn) r.setupProx += v;
      if (diasAte(vc, hoje) < -DIAS_DE_CARENCIA) {
        r.atrasoQtd++;
        r.atrasoValor += v;
      }
    }
  }
  for (const c of comp) {
    if (c.pago && ym(c.pago) === k) {
      r.fatMens += c.recebido;
      r.mensRecebida += c.recebido;
    }
    if (!c.pago && ym(c.venc) === k) r.mensReceber += c.previsto;
    if (!c.pago && diasAte(c.venc, hoje) < -DIAS_DE_CARENCIA) {
      r.atrasoQtd++;
      r.atrasoValor += c.previsto;
    }
  }
  r.faturamento = r.fatSetup + r.fatMens;
  r.previsibilidade = r.mrr + r.setupProx;
  return r;
}

export interface ProximoVencimento {
  venc: Date;
  quem: string;
  oQue: string;
  valor: number;
}

/**
 * Próximos vencimentos em aberto (setup e mensalidades) — original :708-719.
 * Rótulo da mensalidade: "Mensalidade N" (o original escrevia "N/12"; sem ciclo, D1).
 */
export function proximosVencimentos(
  d: DadosFinanceiros,
  mes: string,
  hoje: Date,
  limite = 10,
): ProximoVencimento[] {
  const prox: ProximoVencimento[] = [];
  const porId = new Map(d.clientes.map((c) => [c.id, c]));
  for (const p of d.parcelas) {
    if (p.pago_em || !p.vencimento || !numero(p.valor)) continue;
    const c = porId.get(p.cliente_id);
    if (!c) continue;
    prox.push({
      venc: parseData(p.vencimento)!,
      quem: c.nome,
      oQue: `Setup · ${p.descricao || "parcela"}`,
      valor: numero(p.valor),
    });
  }
  for (const c of competencias(d.clientes, d.mensalidades, mes, hoje)) {
    if (c.pago) continue;
    prox.push({ venc: c.venc, quem: c.cliente, oQue: `Mensalidade ${c.n}`, valor: c.previsto });
  }
  prox.sort((a, b) => a.venc.getTime() - b.venc.getTime());
  return prox.slice(0, limite);
}

export interface LinhaSetup {
  rotulo: string;
  recebido: number;
  aberto: number;
}

/** Setup por cliente (barras empilhadas horizontais) — original :721-730. */
export function setupPorCliente(d: DadosFinanceiros, limite = 8): LinhaSetup[] {
  const pago = new Map<string, number>();
  const aberto = new Map<string, number>();
  for (const p of d.parcelas) {
    const v = numero(p.valor);
    if (!v) continue;
    const alvo = p.pago_em ? pago : aberto;
    alvo.set(p.cliente_id, (alvo.get(p.cliente_id) ?? 0) + v);
  }
  return d.clientes
    .map((c) => ({ rotulo: c.nome, recebido: pago.get(c.id) ?? 0, aberto: aberto.get(c.id) ?? 0 }))
    .filter((r) => r.recebido + r.aberto > 0)
    .sort((x, y) => y.recebido + y.aberto - (x.recebido + x.aberto))
    .slice(0, limite);
}

// ---------------------------------------------------------------------------
// Gráfico de barras: escala e segmentos (original :586-623 e :701-705)
// ---------------------------------------------------------------------------

/** niceStep — original :622. */
export function niceStep(x: number): number {
  const v = x || 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return m * e;
}

/** Eixo Y com 4 divisões (original :590-593): valor pequeno ou vazio vira 0-1-2-3-4, sem rótulos repetidos. */
export function escalaEixo(
  maior: number,
  divisoes = 4,
): { topo: number; passo: number; marcas: number[] } {
  const max = maior < divisoes ? divisoes : maior;
  const passo = niceStep(max / divisoes);
  const topo = passo * Math.ceil(max / passo) || divisoes;
  const marcas: number[] = [];
  for (let t = 0; t <= divisoes; t++) marcas.push((topo * t) / divisoes);
  return { topo, passo, marcas };
}

export type TipoBarra = "mensalidade" | "setup";

export interface SegmentoBarra {
  valor: number;
  tipo: TipoBarra;
  /** true = previsto (hachurado); false = recebido (sólido). */
  previsto: boolean;
}

export interface Barra {
  rotulo: string;
  agora: boolean;
  total: number;
  segmentos: SegmentoBarra[];
}

/** Ordem dos segmentos do original (:703-704): mens recebida, setup recebido, mens prevista, setup previsto. */
export function barrasFaturamento(
  serie: PontoMes[],
  mesAtivo: string,
  rotulo: (d: Date) => string,
): Barra[] {
  return serie.map((x) => ({
    rotulo: rotulo(x.mes),
    agora: x.chave === mesAtivo,
    total: x.total,
    segmentos: [
      { valor: x.mensReal, tipo: "mensalidade", previsto: false },
      { valor: x.setupReal, tipo: "setup", previsto: false },
      { valor: x.mensPrev, tipo: "mensalidade", previsto: true },
      { valor: x.setupPrev, tipo: "setup", previsto: true },
    ],
  }));
}

/** "Setup a receber" por mês (original :732-734): só o setup previsto, de hoje até +5 meses. */
export function barrasSetupAReceber(serie: PontoMes[], rotulo: (d: Date) => string): Barra[] {
  return serie.map((x) => ({
    rotulo: rotulo(x.mes),
    agora: false,
    total: x.setupPrev,
    segmentos: [{ valor: x.setupPrev, tipo: "setup", previsto: true }],
  }));
}

// ---------------------------------------------------------------------------
// Atividade babel (original :548-565; D8 muda a origem do dado)
// ---------------------------------------------------------------------------

/** Linha da RPC gestao_atividade_uso → total por cliente e mês (digitado já sobrepõe o uso, dentro da função). */
export function atividadeDeUso(linhas: AtividadeUso[]): AtividadeFinal[] {
  return linhas.map((l) => ({
    cliente_id: l.cliente_id,
    competencia: l.competencia,
    tokens: numero(l.tokens_final),
    leads: numero(l.leads_final),
  }));
}

export interface TotaisAtividade {
  tokens: number;
  leads: number;
  clientes: number;
}

/** Quanto tempo o consumo pode ficar sem recalcular antes de a tela avisar. O job roda a cada 30 min. */
export const ATIVIDADE_LIMITE_MINUTOS = 120;

export interface FrescorAtividade {
  /** Texto pronto para a tela, sempre preenchido. */
  rotulo: string;
  /** Passou do limite (ou não deu para saber): a tela mostra em tom de aviso. */
  velho: boolean;
}

/**
 * Idade do consumo mostrado na Atividade (B10 da auditoria, 2026-09-22).
 *
 * A leitura é 100% cache e quem o atualiza é um job de 30 min. Se o job parar, o número congela e nada
 * percebe — por isso a tela precisa dizer a idade, e avisar quando ela passar de `ATIVIDADE_LIMITE_MINUTOS`.
 * Carimbo ausente (banco ainda sem a função do v3) ou ilegível conta como VELHO: na dúvida, avisa.
 */
export function frescorAtividade(atualizadaEm: string | null, agora: Date = new Date()): FrescorAtividade {
  if (!atualizadaEm) {
    return { rotulo: "Não deu para saber quando o consumo foi atualizado pela última vez.", velho: true };
  }
  const t = Date.parse(atualizadaEm);
  if (Number.isNaN(t)) {
    return { rotulo: "Não deu para saber quando o consumo foi atualizado pela última vez.", velho: true };
  }
  const minutos = Math.max(0, Math.floor((agora.getTime() - t) / 60000));
  const quando = new Date(t).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (minutos < 60) {
    const ha = minutos <= 1 ? "agora há pouco" : `há ${minutos} minutos`;
    return { rotulo: `Consumo atualizado ${ha} (${quando}).`, velho: minutos > ATIVIDADE_LIMITE_MINUTOS };
  }
  const horas = Math.floor(minutos / 60);
  const ha = horas === 1 ? "há 1 hora" : `há ${horas} horas`;
  return { rotulo: `Consumo atualizado ${ha} (${quando}).`, velho: minutos > ATIVIDADE_LIMITE_MINUTOS };
}

/** totaisAtividade — original :552-560. */
export function totaisAtividade(mes: string, atividade: AtividadeFinal[]): TotaisAtividade {
  const t: TotaisAtividade = { tokens: 0, leads: 0, clientes: 0 };
  for (const a of atividade) {
    if (a.competencia !== mes) continue;
    const tk = numero(a.tokens);
    const ld = numero(a.leads);
    t.tokens += tk;
    t.leads += ld;
    if (tk || ld) t.clientes++;
  }
  return t;
}

/** serieAtividade — original :561-565: os `n` meses que terminam em `mes`. */
export function serieAtividade(
  mes: string,
  n: number,
  atividade: AtividadeFinal[],
): Array<{ mes: Date; chave: string } & TotaisAtividade> {
  const out: Array<{ mes: Date; chave: string } & TotaisAtividade> = [];
  const ini = inicioDoMes(mesParaData(mes));
  for (let i = n - 1; i >= 0; i--) {
    const m = addMeses(ini, -i);
    out.push({ mes: m, chave: ym(m), ...totaisAtividade(ym(m), atividade) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Suporte no Painel (original :572-581 e :788-792)
// ---------------------------------------------------------------------------

/** reuSort — original :578. */
export function ordenarReunioes(
  a: Pick<Reuniao, "data" | "hora">,
  b: Pick<Reuniao, "data" | "hora">,
): number {
  const da = `${a.data || ""} ${a.hora || ""}`;
  const db = `${b.data || ""} ${b.hora || ""}`;
  return da < db ? -1 : da > db ? 1 : 0;
}

export interface ResumoReunioes {
  contagem: Record<"Agendada" | "Concluída" | "Cancelada" | "Remarcada", number>;
  proximas: Reuniao[];
  semRelato: number;
}

/** Config salva em `gestao_config` (chave "equipe"): a lista de pessoas do rodízio de suporte. */
interface ConfigEquipe {
  pessoas?: unknown;
}
/** Config salva em `gestao_config` (chave "rodizioSuporte"): quem recebeu por último. */
interface ConfigRodizio {
  nome?: string | null;
  indice?: number | null;
}

/**
 * equipeSuporte — original :2007 (financeiro.html). Lote M, item "duplicação": estava copiada
 * letra por letra em `aba-implementacao.tsx` e `aba-suporte.tsx`; sobe para cá, única fonte.
 */
export function equipeSuporte(config: Record<string, unknown>): string[] {
  const pessoas = (config.equipe as ConfigEquipe | undefined)?.pessoas;
  return Array.isArray(pessoas)
    ? pessoas.filter((n): n is string => typeof n === "string" && n.length > 0)
    : [];
}

/**
 * Pessoas de suporte cadastradas pelo app Equipe: `gestao_config.equipe.membros[id] = {nome, adicionado}`, gravado pela função
 * do app Equipe (plano-integracao/2026-09-24/GESTAO-PELA-EQUIPE.sql). 2026-09-25 (Adrian): o rodízio e o
 * responsável do chamado saem daqui — ninguém mais digita nome à mão. Nomes únicos, em ordem alfabética.
 */
export function membrosSuporte(config: Record<string, unknown>, deAcessos: string[] = []): string[] {
  // deAcessos (revisão final I3): quem recebeu Suporte pela aba Acessos (gestao_pessoas_suporte), que não passa por membros
  const membros = (config.equipe as { membros?: unknown } | undefined)?.membros;
  const registro = membros && typeof membros === "object" && !Array.isArray(membros) ? (membros as Record<string, unknown>) : {};
  const nomes = Object.values(registro)
    .map((m) => (m && typeof m === "object" ? (m as { nome?: unknown }).nome : null))
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .map((n) => n.trim())
    .concat(deAcessos.map((n) => (typeof n === "string" ? n.trim() : "")).filter(Boolean));
  return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Uma linha da tela do rodízio. `foraDaEquipe`: nome antigo, digitado antes, que não está no app Equipe. */
export interface LinhaRodizio {
  nome: string;
  noRodizio: boolean;
  foraDaEquipe: boolean;
}

/** Primeiro quem está no rodízio, na ordem salva; depois os membros do app Equipe que estão fora dele. */
export function linhasRodizio(config: Record<string, unknown>, deAcessos: string[] = []): LinhaRodizio[] {
  const membros = membrosSuporte(config, deAcessos);
  const fila = equipeSuporte(config);
  return [
    ...fila.map((nome) => ({ nome, noRodizio: true, foraDaEquipe: !membros.includes(nome) })),
    ...membros.filter((n) => !fila.includes(n)).map((nome) => ({ nome, noRodizio: false, foraDaEquipe: false })),
  ];
}

/** O que vai para `gestao_config.equipe.pessoas`: os marcados, na ordem da tela. */
export const pessoasDoRodizio = (linhas: LinhaRodizio[]): string[] => linhas.filter((l) => l.noRodizio).map((l) => l.nome);

/** Sobe (delta -1) ou desce (+1) uma linha; nas pontas não muda nada. */
export function moverLinhaRodizio(linhas: LinhaRodizio[], i: number, delta: -1 | 1): LinhaRodizio[] {
  const j = i + delta;
  if (i < 0 || i >= linhas.length || j < 0 || j >= linhas.length) return linhas;
  const nova = [...linhas];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}

/**
 * proximoSuporte — original :2008-2016. Quem recebe o próximo cliente concluído, pelo rodízio:
 * anda uma posição a partir de quem recebeu por último (por nome; se o nome não estiver mais na
 * equipe, cai no índice salvo). Equipe vazia = ninguém no rodízio.
 */
export function proximoSuporte(config: Record<string, unknown>): { indice: number; nome: string } | null {
  const eq = equipeSuporte(config);
  if (eq.length === 0) return null;
  const r = config.rodizioSuporte as ConfigRodizio | undefined;
  let i = 0;
  if (r) {
    const j = r.nome ? eq.indexOf(r.nome) : -1;
    if (j >= 0) i = (j + 1) % eq.length;
    else if (typeof r.indice === "number") i = (r.indice + 1) % eq.length;
  }
  return { indice: i, nome: eq[i] };
}

export function resumoReunioes(
  reunioes: Reuniao[],
  mes: string,
  hoje: Date,
  limite = 6,
): ResumoReunioes {
  const contagem = { Agendada: 0, Concluída: 0, Cancelada: 0, Remarcada: 0 };
  for (const r of reunioes) {
    if (r.data && ym(parseData(r.data)) === mes && r.status && r.status in contagem) {
      contagem[r.status as keyof typeof contagem]++;
    }
  }
  const h0 = ymd(hoje);
  const proximas = reunioes
    .filter((x) => x.status === "Agendada" && (x.data ?? "") >= h0)
    .sort(ordenarReunioes)
    .slice(0, limite);
  const semRelato = reunioes.filter(
    (x) => x.status === "Concluída" && !(x.resumo || "").trim(),
  ).length;
  return { contagem, proximas, semRelato };
}

// ---------------------------------------------------------------------------
// Indicações (D4) e tarefas (selo da aba)
// ---------------------------------------------------------------------------

/**
 * diaDaIndicacao — patch 04 (a)/(b): o dia de calendário da indicação, sem fuso.
 * Antes: ym(new Date(createdAt)); "2026-10-01" virava 30/09 21:00 em Brasília e contava no mês errado.
 * Sem `data_indicacao` (linha antiga), cai no dia LOCAL de `criado_em`.
 */
export function diaDaIndicacao(i: Pick<Indicacao, "data_indicacao" | "criado_em">): string {
  return i.data_indicacao || (i.criado_em ? ymd(new Date(i.criado_em)) : "");
}

export function indicacoesDoMes(indicacoes: Indicacao[], mes: string): Indicacao[] {
  return indicacoes.filter((i) => diaDaIndicacao(i).slice(0, 7) === mes);
}

/** tfDiff/tfAberta/tfAtrasada — original :3446-3448. */
export function diasParaPrazo(prazo: string | null, hoje: Date): number | null {
  const d = parseData(prazo);
  return d ? diasAte(d, hoje) : null;
}
export const tarefaAberta = (t: Pick<Tarefa, "status">): boolean => t.status !== "concluida";
/**
 * Importação de indicações — artefato `MAPA_COLUNAS` :1343, `chaveColuna` :1357, `lerTabela` :1362,
 * `lerImportacao` :1408 e `normalizarIndicacao` :1396. Era o botão "Importar", em breve.
 * Aceita JSON, CSV, TSV ou linhas coladas da planilha de respostas (com a linha de títulos).
 */
const MAPA_COLUNAS: Record<string, string[]> = {
  leadName: ["seu nome", "nome", "nome do indicado", "indicado", "leadname", "nome completo"],
  leadWhatsapp: ["seu whatsapp", "whatsapp", "telefone", "celular", "leadwhatsapp", "whats"],
  leadEmail: ["seu email", "seu e mail", "email", "e mail", "leademail"],
  company: ["sua empresa", "empresa", "company"],
  niche: ["nicho segmento", "nicho", "segmento", "niche"],
  need: ["o que voce busca resolver", "o que busca resolver", "o que busca", "need", "necessidade"],
  bestTime: ["melhor horario pra contato", "melhor horario para contato", "melhor horario", "horario", "besttime"],
  preferredDate: ["melhor dia pra conversar", "melhor dia para conversar", "melhor dia", "preferreddate", "data preferida"],
  referrerName: ["quem te indicou pra babel", "quem te indicou", "quem indicou", "indicado por", "referrername"],
  referrerCode: ["codigo de indicacao", "codigo", "ref", "referrercode"],
  createdAt: ["carimbo de data hora", "timestamp", "enviado em", "data de envio", "createdat", "data"],
  status: ["status", "situacao"],
};

const semAcento = (v: string): string =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Cabeçalho da planilha → chave conhecida, ou null. Artefato :1357. */
export function chaveDaColuna(cabecalho: string): string | null {
  const n = semAcento(cabecalho).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  for (const k of Object.keys(MAPA_COLUNAS)) if (MAPA_COLUNAS[k].includes(n)) return k;
  return null;
}

/** Erro com causa reconhecível, para a tela dizer a frase certa (artefato :1378). */
export class ErroImportacao extends Error {
  motivo: "cabecalho" | "formato";
  constructor(motivo: "cabecalho" | "formato", mensagem: string) {
    super(mensagem);
    this.motivo = motivo;
  }
}

/** Lê texto delimitado respeitando aspas. Separador descoberto na 1ª linha. Artefato :1362. */
function lerDelimitado(texto: string): Array<Record<string, string>> {
  const t = texto.replace(/\r\n?/g, "\n");
  const primeira = t.split("\n").find((l) => l.trim()) ?? "";
  const sep = primeira.includes("\t")
    ? "\t"
    : primeira.split(";").length > primeira.split(",").length
      ? ";"
      : ",";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          celula += '"';
          i++;
        } else aspas = false;
      } else celula += c;
      continue;
    }
    if (c === '"' && celula === "") {
      aspas = true;
      continue;
    }
    if (c === sep) {
      linha.push(celula);
      celula = "";
      continue;
    }
    if (c === "\n") {
      linha.push(celula);
      celula = "";
      if (linha.join("").trim()) linhas.push(linha);
      linha = [];
      continue;
    }
    celula += c;
  }
  linha.push(celula);
  if (linha.join("").trim()) linhas.push(linha);
  if (linhas.length < 2) return [];

  const chaves = linhas[0].map(chaveDaColuna);
  if (!chaves.includes("leadName") && !chaves.includes("leadWhatsapp")) {
    throw new ErroImportacao(
      "cabecalho",
      "Não encontrei as colunas de nome ou WhatsApp. Copie junto a linha de títulos.",
    );
  }
  return linhas.slice(1).map((r) => {
    const o: Record<string, string> = {};
    chaves.forEach((k, j) => {
      if (k && r[j] != null && String(r[j]).trim()) o[k] = String(r[j]).trim();
    });
    return o;
  });
}

/** Artefato `dataISO`: "dd/mm/aaaa" ou "aaaa-mm-dd…" → "aaaa-mm-dd"; outra coisa → "". */
export function dataISOImportada(v: string | undefined): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? String(v).slice(0, 10) : "";
}

/** Artefato `momentoISO`: "dd/mm/aaaa[ hh:mm[:ss]]" (hora local, 12h se faltar) ou data legível → ISO; senão "". */
export function momentoISOImportado(v: string | undefined): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }
  const d2 = new Date(v);
  return isNaN(d2.getTime()) ? "" : d2.toISOString();
}

/**
 * Artefato `idEstavel` :1337-1341: a mesma indicação importada duas vezes gera o mesmo id.
 * Vai em `id_origem`; os registros vindos do artefato já têm esse id, então reimportar não duplica.
 * Usa `createdAt` já normalizado por `momentoISOImportado`, como o artefato.
 */
export function idEstavelIndicacao(o: Record<string, string>): string {
  // `norm` do artefato (:1076): sem acento, minúsculo, espaços juntados e aparados.
  const nome = semAcento(o.leadName ?? "").replace(/\s+/g, " ").trim();
  const base = `${o.createdAt ?? ""}|${String(o.leadWhatsapp ?? "").replace(/\D/g, "")}|${nome}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) h = ((h << 5) - h + base.charCodeAt(i)) | 0;
  return `ind${(h >>> 0).toString(36)}${base.length.toString(36)}`;
}

/** Arruma horário, status e código, como o artefato (:1396). */
export function normalizarIndicacaoImportada(o: Record<string, string>): Record<string, string> {
  const x = { ...o };
  const bt = semAcento(x.bestTime ?? "");
  if (bt) {
    x.bestTime = bt.startsWith("manh") ? "manha" : bt.startsWith("tard") ? "tarde" : bt.startsWith("noit") ? "noite" : x.bestTime;
  }
  if (x.preferredDate) x.preferredDate = dataISOImportada(x.preferredDate) || x.preferredDate;
  if (x.createdAt) x.createdAt = momentoISOImportado(x.createdAt) || x.createdAt;
  if (x.referrerCode) x.referrerCode = x.referrerCode.toUpperCase().trim();
  if (x.status) {
    const sn = semAcento(x.status);
    const achou = STATUS_INDICACAO.find(([k, r]: [string, string]) => sn === k || sn === semAcento(r));
    x.status = achou ? achou[0] : "novo";
  }
  return x;
}

/**
 * JSON, CSV, TSV ou colado da planilha → lista de indicações prontas.
 * Só entram linhas com nome ou WhatsApp (artefato :1531).
 */
export function lerImportacaoIndicacoes(bruto: string): Array<Record<string, string>> {
  const raw = bruto.trim();
  if (!raw) return [];
  let lista: Array<Record<string, string>>;
  if (/^[[{]/.test(raw)) {
    try {
      const j: unknown = JSON.parse(raw);
      const arr = Array.isArray(j)
        ? j
        : ((j as { indicacoes?: unknown[]; colecoes?: { indicacoes?: unknown[] } }).indicacoes ??
            (j as { colecoes?: { indicacoes?: unknown[] } }).colecoes?.indicacoes ?? [j]);
      lista = (arr as Array<Record<string, string>>) ?? [];
    } catch {
      throw new ErroImportacao("formato", "Não consegui entender os dados colados.");
    }
  } else {
    lista = lerDelimitado(raw);
  }
  return lista
    .filter((o) => o && typeof o === "object" && (o.leadName || o.leadWhatsapp))
    .map(normalizarIndicacaoImportada);
}

/**
 * dd/mm/aaaa digitado → ISO (aaaa-mm-dd), ou "" se não der. Artefato `dataDeBR`.
 * Confere o dia de verdade: 31/02 não passa.
 */
export function dataDeBR(valor: string): string {
  const m = valor.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || dia < 1) return "";
  const d = new Date(ano, mes - 1, dia);
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return "";
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Horário 24h "hh:mm". Artefato `horaValida`. Vazio é tratado por quem chama. */
export const horaValida = (v: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim());

/** Máscara de data enquanto se digita: 2 dígitos, barra, 2, barra, 4. */
export function mascararData(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Máscara de horário: hh:mm. */
export function mascararHora(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** Máscara de WhatsApp do artefato (:2859-2862): (11) 91234-5678. */
export function mascararWhatsapp(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Mesma checagem do artefato (:2872). Vazio é aceito: e-mail não é obrigatório. */
export const emailValido = (e: string): boolean => !e || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/** Um compromisso do dia, na visão Semana. Artefato `viewTfSemana` :3667. */
export interface EventoSemana {
  /** Dia, YYYY-MM-DD. */
  dia: string;
  /** Hora "HH:MM"; vazio nas tarefas, que só têm prazo. */
  hora: string;
  /** De onde vem: decide a cor da tarja (artefato :3691-3693). */
  tipo: "equipe" | "impl" | "prog" | "sup" | "com" | "tarefa";
  titulo: string;
  /** Linha de baixo: quem, ou quantos participantes. */
  quem: string;
  /** Só para tarefa: já está concluída. */
  feito?: boolean;
}

/** Segunda-feira da semana, com deslocamento em semanas. Artefato `inicioSemana` :3459. */
export function inicioDaSemana(hoje: Date, deslocamento = 0): Date {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * deslocamento);
  return d;
}

/**
 * Os sete dias da semana com tudo que está marcado neles: reuniões de equipe, de suporte, de
 * implementação/programação/comercial e prazos de tarefa. Artefato :3670-3682.
 * `quem` = "todos" ou o nome de uma pessoa (filtra por responsável ou participação).
 */
export function semanaDeEventos(dados: Dados, inicio: Date, quem = "todos"): EventoSemana[][] {
  const dias: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    dias.push(ymd(d));
  }
  const de = dias[0];
  const ate = dias[6];
  const caixas: EventoSemana[][] = dias.map(() => []);
  const serve = (resp: string | null, participantes?: string[] | null): boolean =>
    quem === "todos" || resp === quem || (participantes ?? []).includes(quem);
  const por = (data: string | null, e: Omit<EventoSemana, "dia">) => {
    if (!data || data < de || data > ate) return;
    caixas[dias.indexOf(data)].push({ ...e, dia: data });
  };
  const nomeCliente = (id: string | null): string =>
    dados.clientes.find((c) => c.id === id)?.nome ?? "cliente";

  for (const r of dados.reunioesEquipe) {
    if (r.status === "Cancelada" || !serve("", r.participantes)) continue;
    const n = (r.participantes ?? []).length;
    por(r.data, {
      hora: r.hora ?? "",
      tipo: "equipe",
      titulo: r.titulo || r.tipo || "Reunião da equipe",
      quem: `${n} participante${n === 1 ? "" : "s"}`,
    });
  }
  for (const r of dados.reunioes) {
    if (r.status !== "Agendada" && r.status !== "Concluída") continue;
    if (!serve(r.responsavel)) continue;
    por(r.data, {
      hora: r.hora ?? "",
      tipo: "sup",
      titulo: `${r.tipo || "Suporte"} · ${nomeCliente(r.cliente_id)}`,
      quem: r.responsavel || "sem responsável",
    });
  }
  for (const r of dados.implReunioes) {
    if (r.status !== "Agendada" && r.status !== "Concluída") continue;
    if (!serve(r.responsavel)) continue;
    por(r.data, {
      hora: r.hora ?? "",
      tipo: r.area === "prog" ? "prog" : r.area === "ind" ? "com" : "impl",
      titulo: `${r.tipo || "Reunião"} · ${nomeCliente(r.cliente_id)}`,
      quem: r.responsavel || "sem responsável",
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
    });
  }
  // sem hora vai para o fim do dia, como no artefato (:3696)
  for (const c of caixas) c.sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99"));
  return caixas;
}

/** Uma linha da visão "Por pessoa" da aba Tarefas do time. Artefato `viewTfPessoas` :3756. */
export interface CargaPessoa {
  nome: string;
  tarefas: number;
  atrasadas: number;
  vencemEm7: number;
  bloqueadas: number;
  implementacoes: number;
  reunioesEm7: number;
  /** tarefas abertas + implementações em aberto — a barra da última coluna */
  carga: number;
}

/**
 * Carga de cada pessoa do time: o que está aberto na mão dela hoje. Artefato :3760-3768, incluindo a
 * ordenação (mais atrasadas primeiro, depois mais carga, depois nome) e a janela de 7 dias.
 */
export function cargaPorPessoa(dados: Dados, hoje: Date): CargaPessoa[] {
  const h0 = ymd(hoje);
  const fim = ymd(new Date(hoje.getTime() + 6 * 86400000));
  const pessoas = [
    ...new Set(dados.funcionarios.filter((f) => f.ativo !== false).map((f) => f.nome)),
  ];
  const linhas = pessoas.map((n): CargaPessoa => {
    const tar = dados.tarefas.filter((t) => tarefaAberta(t) && t.responsavel === n);
    const impl = dados.implementacoes.filter(
      (i) =>
        i.status !== "concluida" &&
        (i.responsavel === n || (i.status === "programador" && i.programador === n)),
    ).length;
    const naJanela = (data: string | null): boolean => !!data && data >= h0 && data <= fim;
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
  });
  return linhas.sort(
    (a, b) => b.atrasadas - a.atrasadas || b.carga - a.carga || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Tarefas abertas que ninguém assumiu — o aviso no topo da visão (artefato :3760). */
export const tarefasSemResponsavel = (dados: Dados): number =>
  dados.tarefas.filter((t) => tarefaAberta(t) && !t.responsavel).length;

export function tarefaAtrasada(t: Pick<Tarefa, "status" | "prazo">, hoje: Date): boolean {
  const d = diasParaPrazo(t.prazo, hoje);
  return tarefaAberta(t) && !!t.prazo && d !== null && d < 0;
}
