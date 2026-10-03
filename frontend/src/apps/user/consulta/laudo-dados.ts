/**
 * laudo-dados — normalização pura do resultado da Consulta Completa (CPF/CNPJ).
 *
 * O jsonb da API varia por pessoa (seções vazias/cheias/indisponíveis). Aqui
 * concentramos a LEITURA e classificação — sem JSX — pra os 3 renderizadores
 * (laudo dark do app, laudo claro do link público, e o PDF) usarem o mesmo
 * cérebro e nunca quebrarem com dados faltando.
 */

export type Obj = Record<string, unknown>;
export const ehObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
export const comoArr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(ehObj) : []);
export const txt = (v: unknown): string => (v == null ? "" : String(v));

/** Quantidade de registros de uma seção (num_registros/quantidade), ou null. */
export function qtd(v: unknown): number | null {
  if (!ehObj(v)) return null;
  const n = v.num_registros ?? v.quantidade;
  return n == null || n === "" ? null : Number(n) || 0;
}

export function humaniza(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/\b(bvs|cpf|cnpj|ccf|scpc|spc|pf|pj|scr|uf|rfb)\b/gi, (m) => m.toUpperCase())
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

// Seções de restrição (num_registros > 0 = apontamento negativo).
export const RESTRICOES: Record<string, string> = {
  registro_pefin_serasa: "Pefin (Serasa)",
  registro_refin_serasa: "Refin (Serasa)",
  registro_divida_vencida_serasa: "Dívida vencida (Serasa)",
  registro_scpc_bvs: "SCPC / SPC",
  protesto: "Protesto",
  protesto_estadual: "Protesto estadual",
  ccf: "Cheque sem fundo (CCF)",
  ccf_achei: "Cheque sem fundo (CCF)",
  ccf_interno: "Cheque sem fundo (interno)",
  cheque_contra_ordem_outras_ocorrencias: "Cheque sustado / contra-ordem",
  acao: "Ações / processos",
};
// Seções com num_registros que NÃO são restrição (informativas).
export const INFORMATIVAS: Record<string, string> = {
  participacoes_empresas_bvs: "Participação em empresas",
  participacoes_empresas: "Participação em empresas",
  consultas_anteriores_sintetico_bvs: "Quem consultou (resumo)",
  consultas_anteriores_analitico_bvs: "Quem consultou (detalhe)",
};
export const CAMPOS_IDENT = ["nome", "data_nascimento", "situacao_cpf", "estado_civil", "sexo", "nome_mae"];
export const CAMPOS_LOCAL = ["cidade", "uf", "bairro", "cep", "endereco", "telefone_celular", "telefone_residencial", "email"];

/**
 * Achata qualquer valor do jsonb (objeto/array/escalar) numa lista de linhas
 * legíveis "Campo: valor" — usado pela seção "Outras informações" pra nunca
 * descartar dado não mapeado. Profundidade e volume limitados.
 */
export function acharLinhas(valor: unknown, prof = 0): string[] {
  if (prof > 3 || valor == null) return [];
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") {
    const s = String(valor).trim();
    return s && s !== "-" ? [s] : [];
  }
  if (Array.isArray(valor)) return valor.flatMap((v) => acharLinhas(v, prof + 1)).slice(0, 40);
  if (ehObj(valor)) {
    const out: string[] = [];
    for (const [k, v] of Object.entries(valor)) {
      if (k === "num_registros" || k === "quantidade") continue;
      const sub = acharLinhas(v, prof + 1);
      if (sub.length) out.push(`${humaniza(k)}: ${sub.join("; ")}`);
    }
    return out.slice(0, 40);
  }
  return [];
}

export type Restricao = { chave: string; label: string; n: number; detalhes: string[]; valorTotal: string };

/** Formata os registros de uma seção de restrição em linhas legíveis (valor · data · cidade/uf · tipo). */
export function detalharRegistros(sec: unknown): { detalhes: string[]; valorTotal: string } {
  if (!ehObj(sec)) return { detalhes: [], valorTotal: "" };
  const detalhes = comoArr(sec.registros)
    .map((reg) => {
      const valor = txt(reg.valor) ? `${txt(reg.moeda) || "R$"} ${txt(reg.valor)}` : "";
      const local = [txt(reg.cidade), txt(reg.uf)].filter(Boolean).join("/");
      const cart = txt(reg.cartorio);
      return [valor, txt(reg.data), local, cart && cart !== "UN" ? `cartório ${cart}` : "", txt(reg.tipo)]
        .filter(Boolean)
        .join(" · ");
    })
    .filter(Boolean);
  const valorTotal = ehObj(sec.informacoes) ? txt((sec.informacoes as Obj).valor_total) : "";
  return { detalhes, valorTotal };
}

/** Formata valor monetário cru da API; vazio quando 0/-/ausente. */
const moeda = (v: string): string => (v && v !== "0" && v !== "0,00" && v !== "-" ? `R$ ${v}` : "");

export type ScoreInfo = { pontuacao: string; classe: string };
export type OperacaoScr = {
  modalidade: string;
  subModalidade: string;
  valor: string;
  situacao: string;
  restritiva: boolean;
};
export type Scr = {
  operacoes: OperacaoScr[];
  totalVencido: string;
  qtdOperacoes: string;
  qtdInstituicoes: string;
  dataBase: string;
  temRestritiva: boolean;
};
export type ResumoFinanceiro = {
  creditoVencido: string;
  prejuizo: string;
  limiteCredito: string;
  creditoAVencer: string;
};
export type VisaoRapidaItem = { chave: string; label: string; quantidade: number; valor: string };

/**
 * SCR / Banco Central — operações de crédito do `operacoes` (a API marca
 * `vencimentos.registros.restritivo:"1"` em crédito vencido). Metadados (qtd
 * operações/instituições/data-base) vêm do `resumo` e do `consolidado`.
 */
export function extrairScr(r: Obj): Scr | null {
  const sec = ehObj(r.operacoes) ? r.operacoes : null;
  const regs = sec ? comoArr(sec.registros) : [];
  if (!regs.length) return null;
  const operacoes: OperacaoScr[] = regs.map((op) => {
    const vencSec = ehObj(op.vencimentos) ? (op.vencimentos as Obj) : {};
    const venc = ehObj(vencSec.registros) ? (vencSec.registros as Obj) : {};
    const mod = ehObj(op.modalidade) ? (op.modalidade as Obj) : {};
    const sub = ehObj(op.sub_modalidade) ? (op.sub_modalidade as Obj) : {};
    return {
      modalidade: txt(mod.descricao),
      subModalidade: txt(sub.descricao),
      valor: moeda(txt(op.total)),
      situacao: txt(venc.descricao),
      restritiva: txt(venc.restritivo) === "1",
    };
  });
  const resumo = ehObj(r.resumo) ? r.resumo : {};
  const consol = ehObj(r.consolidado) ? r.consolidado : {};
  const cv = ehObj(consol.credito_vencido) ? (consol.credito_vencido as Obj) : {};
  return {
    operacoes,
    totalVencido: moeda(txt(cv.valor)),
    qtdOperacoes: txt(resumo.qtd_operacoes),
    qtdInstituicoes: txt(resumo.qtd_instituicoes),
    dataBase: txt(resumo.data_base_consultada),
    temRestritiva: operacoes.some((o) => o.restritiva),
  };
}

/** Resumo financeiro consolidado (crédito vencido, prejuízo, limite, a vencer). */
export function extrairResumoFinanceiro(r: Obj): ResumoFinanceiro | null {
  const c = ehObj(r.consolidado) ? r.consolidado : null;
  if (!c) return null;
  const val = (k: string): string => moeda(txt(ehObj(c[k]) ? (c[k] as Obj).valor : ""));
  const rf = {
    creditoVencido: val("credito_vencido"),
    prejuizo: val("prejuizo"),
    limiteCredito: val("limite_credito"),
    creditoAVencer: val("credito_a_vencer"),
  };
  return rf.creditoVencido || rf.prejuizo || rf.limiteCredito || rf.creditoAVencer ? rf : null;
}

/** Visão rápida — sumário de ocorrências do `resumo_ocorrencias` (só itens com quantidade > 0). */
export function extrairVisaoRapida(r: Obj): VisaoRapidaItem[] {
  const ro = ehObj(r.resumo_ocorrencias) ? r.resumo_ocorrencias : null;
  if (!ro) return [];
  const LABELS: Record<string, string> = {
    protesto: "Protestos",
    ccf: "Cheques sem fundo",
    acao: "Ações / processos",
    ccf_interno: "Cheques (interno)",
    registro_scpc_bvs: "SCPC / SPC",
    participacoes_empresas_bvs: "Participação em empresas",
    consultas_anteriores_sintetico_bvs: "Consultas recentes",
  };
  return Object.entries(ro)
    .map(([k, v]) => {
      const o = ehObj(v) ? v : {};
      return { chave: k, label: LABELS[k] || humaniza(k), quantidade: Number(txt(o.quantidade)) || 0, valor: moeda(txt(o.valor)) };
    })
    .filter((x) => x.quantidade > 0);
}

/**
 * A API repete o mesmo protesto em `protesto` e `protesto_estadual`. Funde num
 * só item (preferindo o mais detalhado — o estadual traz data) pra não dobrar a
 * contagem de apontamentos do veredito.
 */
function fundirProtestos(restricoes: Restricao[]): Restricao[] {
  const p = restricoes.find((x) => x.chave === "protesto");
  const pe = restricoes.find((x) => x.chave === "protesto_estadual");
  if (!p || !pe || !p.valorTotal || p.valorTotal !== pe.valorTotal) return restricoes;
  const rico = pe.detalhes.join("").length >= p.detalhes.join("").length ? pe : p;
  const fundido: Restricao = { ...rico, chave: "protesto", label: "Protesto" };
  // mantém o item fundido na posição do primeiro protesto (preserva a ordem de exibição)
  return restricoes.flatMap((x) => {
    if (x.chave === "protesto") return [fundido];
    if (x.chave === "protesto_estadual") return [];
    return [x];
  });
}
export type Informativa = { chave: string; label: string; registros: Obj[] };
export type Extra = { chave: string; label: string; linhas: string[] };
export type Laudo = {
  nome: string;
  documento: string;
  nascimento: string;
  situacao: string;
  localResumo: string;
  ident: Obj;
  local: Obj;
  limpo: boolean;
  totalApontamentos: number;
  temBaseRestricao: boolean;
  pontuacao: string;
  classeRisco: string;
  probInadimplencia: string;
  esclarecimentoScore: string;
  scoreSecundario: ScoreInfo | null;
  renda: string;
  visaoRapida: VisaoRapidaItem[];
  resumoFinanceiro: ResumoFinanceiro | null;
  scr: Scr | null;
  restricoes: Restricao[];
  informativas: Informativa[];
  extras: Extra[];
};

/** Lê o resultado e devolve a estrutura normalizada do laudo. */
export function normalizarLaudo(resultado: unknown): Laudo | null {
  if (!ehObj(resultado)) return null;
  const r = resultado;
  const info = ehObj(r.informacoes) ? r.informacoes : {};
  const ident = ehObj(info.identificacao) ? info.identificacao : ehObj(r.resumo) ? r.resumo : {};
  const local = ehObj(info.localizacao) ? info.localizacao : {};

  const restricoes = fundirProtestos(
    Object.keys(RESTRICOES)
      .filter((k) => k in r && qtd(r[k]) != null)
      .map((k) => {
        const { detalhes, valorTotal } = detalharRegistros(r[k]);
        return { chave: k, label: RESTRICOES[k], n: qtd(r[k]) ?? 0, detalhes, valorTotal };
      }),
  );
  const totalApontamentos = restricoes.reduce((s, x) => s + x.n, 0);

  const s6 = ehObj(r.score_6_meses) ? r.score_6_meses : null;
  const sc = ehObj(r.score) ? r.score : null;
  // score_6_meses é o principal; `score` (modelo distinto) entra como secundário quando os dois existem.
  const scoreSecundario: ScoreInfo | null =
    s6 && sc && txt(sc.pontuacao) ? { pontuacao: txt(sc.pontuacao), classe: txt(sc.faixa) } : null;
  const cidade = txt(local.cidade);
  const uf = txt(local.uf);

  // "Outras informações": tudo que as seções curadas não consumiram (inclusive campos novos da API).
  const consumidas = new Set<string>([
    "informacoes", "resumo", "score", "score_6_meses", "renda_presumida_bvs", "mensagem",
    "operacoes", "consolidado", "resumo_ocorrencias", "positivo",
    ...Object.keys(RESTRICOES), ...Object.keys(INFORMATIVAS),
  ]);
  const extras: Extra[] = Object.keys(r)
    .filter((k) => !consumidas.has(k))
    .map((k) => ({ chave: k, label: humaniza(k), linhas: acharLinhas(r[k]) }))
    .filter((e) => e.linhas.length > 0);

  return {
    nome: txt(ident.nome) || "Documento consultado",
    documento: txt(ident.cpf) || txt(ident.cnpj) || txt(ident.documento) || "",
    nascimento: txt(ident.data_nascimento) || txt(ident.nascimento_fundacao),
    situacao: txt(ident.situacao_cpf),
    localResumo: cidade || uf ? `${cidade}${uf ? `/${uf}` : ""}` : "",
    ident,
    local,
    limpo: totalApontamentos === 0 && restricoes.length > 0,
    totalApontamentos,
    temBaseRestricao: restricoes.length > 0,
    pontuacao: txt(s6?.score) || txt(sc?.pontuacao),
    classeRisco: txt(s6?.classe_risco) || txt(sc?.faixa),
    probInadimplencia: txt(s6?.probabilidade_inadimplencia),
    esclarecimentoScore: txt(s6?.esclarecimento),
    scoreSecundario,
    renda: ehObj(r.renda_presumida_bvs) ? txt(r.renda_presumida_bvs.texto) : "",
    visaoRapida: extrairVisaoRapida(r),
    resumoFinanceiro: extrairResumoFinanceiro(r),
    scr: extrairScr(r),
    restricoes,
    informativas: Object.keys(INFORMATIVAS)
      .filter((k) => k in r && comoArr((r[k] as Obj)?.registros).length > 0)
      .map((k) => ({ chave: k, label: INFORMATIVAS[k], registros: comoArr((r[k] as Obj).registros) })),
    extras,
  };
}
