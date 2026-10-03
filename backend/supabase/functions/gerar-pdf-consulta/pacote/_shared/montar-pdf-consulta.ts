/**
 * PDF do resultado de consulta (pdf-lib, Deno edge) — laudo com identidade
 * visual do tenant (logo + faixa de marca). Mesma leitura do laudo do app
 * (veredito por num_registros, score, restrições). Robusto: logo/banner que
 * falham são ignorados; seções ausentes são puladas; A4 paginado.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "npm:pdf-lib@1.17.1";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
// Identidade compartilhada com o relatório: cor, margem e escala saem do tema,
// não de constante local. Regras em documentos/plataforma/design-system-relatorios-pdf.md.
import { COR, MARGEM, PAGINA, sanear, UTIL } from "./pdf-tema.ts";

export interface ConsultaPdf {
  titulo: string | null;
  nome_empresa: string | null;
  logo_url: string | null;
  banner_url: string | null;
  documento: string | null;
  tipo_doc: string | null;
  resultado: Record<string, unknown> | null;
  consultada_em: string | null;
  chave_publica: string;
}

const A4 = { w: PAGINA.largura, h: PAGINA.altura };
const M = MARGEM;
const LU = UTIL;
const MARCA = COR.marca;
const VERDE = COR.positivo;
const VERDE_BG = COR.positivoFundo;
const VERMELHO = COR.negativo;
const VERMELHO_BG = COR.negativoFundo;
const CINZA = COR.textoSuave;
const PRETO = COR.texto;
const LINHA = COR.linha;

const san = sanear;
/** Rótulos acentuados dos campos que o laudo mostra com frequência. Fora daqui
 *  cai no humaniza genérico — que não tem como adivinhar acento de chave crua. */
const ROTULOS_CAMPO: Record<string, string> = {
  situacao_cpf: "Situação do CPF",
  nome_mae: "Nome da mãe",
  data_nascimento: "Data de nascimento",
  estado_civil: "Estado civil",
  endereco: "Endereço",
  telefone_celular: "Telefone celular",
  telefone_residencial: "Telefone residencial",
  email: "E-mail",
  renda_presumida_bvs: "Renda presumida",
  valor_total: "Valor total",
  num_registros: "Registros",
  participacoes_empresas_bvs: "Participação em empresas",
};

function humaniza(k: string): string {
  if (ROTULOS_CAMPO[k]) return ROTULOS_CAMPO[k];
  return k.replace(/_/g, " ").replace(/\b(bvs|cpf|cnpj|ccf|scpc|spc|pf|pj|scr|uf|rfb)\b/gi, (m) => m.toUpperCase()).replace(/\b\w/g, (m) => m.toUpperCase()).trim();
}
function val(v: unknown): string {
  return v == null ? "" : String(v);
}
function ehObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function qtd(v: unknown): number | null {
  if (!ehObj(v)) return null;
  const n = v.num_registros ?? v.quantidade;
  return n == null || n === "" ? null : Number(n) || 0;
}

const RESTRICOES: Record<string, string> = {
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
const CAMPOS_IDENT = ["nome", "data_nascimento", "situacao_cpf", "estado_civil", "sexo", "nome_mae"];
const CAMPOS_LOCAL = ["cidade", "uf", "bairro", "cep", "endereco", "telefone_celular", "telefone_residencial", "email"];

/** Achata qualquer valor do jsonb em linhas legíveis (seção "Outras informações"). */
function acharLinhas(valor: unknown, prof = 0): string[] {
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

type Ctx = { doc: PDFDocument; page: PDFPage; y: number; font: PDFFont; bold: PDFFont };

function novaPagina(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([A4.w, A4.h]);
  ctx.y = A4.h - M;
}
function garantir(ctx: Ctx, precisa: number) {
  if (ctx.y - precisa < M + 24) novaPagina(ctx);
}
function quebrar(t: string, f: PDFFont, s: number, maxW: number): string[] {
  const out: string[] = [];
  let at = "";
  for (const p of san(t).split(/\s+/)) {
    const tt = at ? `${at} ${p}` : p;
    if (f.widthOfTextAtSize(tt, s) > maxW && at) { out.push(at); at = p; } else at = tt;
  }
  if (at) out.push(at);
  return out;
}
function texto(ctx: Ctx, t: string, o: { size?: number; bold?: boolean; cor?: ReturnType<typeof rgb>; x?: number; gap?: number } = {}) {
  const size = o.size ?? 10;
  const f = o.bold ? ctx.bold : ctx.font;
  const x = o.x ?? M;
  for (const ln of quebrar(t, f, size, A4.w - x - M)) {
    garantir(ctx, size + 4);
    ctx.page.drawText(ln, { x, y: ctx.y, size, font: f, color: o.cor ?? PRETO });
    ctx.y -= size + (o.gap ?? 4);
  }
}

/**
 * Baixa, REDIMENSIONA e recomprime uma imagem antes de embutir — imagens de
 * tenant podem vir gigantes (ex: logo PNG de 6 MB) e estourar o worker no
 * embed cru. Reduz pra `maxLargura` + JPG, então embute leve. Guarda de 8 MB
 * (acima disso nem decodifica) e falha silenciosa → null.
 */
/** Anti-SSRF: só baixa imagem do storage HTTPS do próprio Supabase (logo/banner). */
function urlStoragePermitida(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase().replace(/\.+$/, "");
    return h.endsWith(".supabase.co") || h.endsWith(".supabase.in");
  } catch {
    return false;
  }
}

async function embImg(doc: PDFDocument, url: string | null, maxLargura: number): Promise<PDFImage | null> {
  if (!url || !urlStoragePermitida(url)) return null;
  try {
    const r = await fetch(url, { redirect: "manual" });
    if (!r.ok) return null;
    const cl = Number(r.headers.get("content-length") ?? 0);
    if (cl > 8_000_000) return null;
    const ab = new Uint8Array(await r.arrayBuffer());
    if (ab.length > 8_000_000) return null;
    const img = await Image.decode(ab);
    if (img.width > maxLargura) img.resize(maxLargura, Image.RESIZE_AUTO);
    const jpg = await img.encodeJPEG(80);
    return await doc.embedJpg(jpg);
  } catch {
    return null;
  }
}

const SECAO_BG = rgb(0.95, 0.96, 0.99);
const ZEBRA = rgb(0.975, 0.978, 0.985);
const HEAD_BG = rgb(0.92, 0.93, 0.97);

function escalarStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}
function paresEscalares(obj: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k === "num_registros" || k === "quantidade") continue;
    const e = escalarStr(v);
    if (e !== null && e.trim() !== "" && e.trim() !== "-") out.push([humaniza(k), e]);
  }
  return out;
}
const objsDe = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(ehObj) : []);

/** Faixa de cabeçalho de seção. */
function cabecalhoSecao(ctx: Ctx, titulo: string) {
  garantir(ctx, 26);
  ctx.page.drawRectangle({ x: M, y: ctx.y - 17, width: LU, height: 17, color: SECAO_BG });
  ctx.page.drawText(san(titulo).toUpperCase().slice(0, 70), { x: M + 8, y: ctx.y - 12.5, size: 8.5, font: ctx.bold, color: MARCA });
  ctx.y -= 24;
}
/** Grid de fichas: 2 colunas, rótulo pequeno em cima, valor embaixo. */
function gridFichas(ctx: Ctx, pares: [string, string][]) {
  const colW = LU / 2;
  for (let i = 0; i < pares.length; i += 2) {
    garantir(ctx, 24);
    const yy = ctx.y;
    for (let c = 0; c < 2 && i + c < pares.length; c++) {
      const [lab, vl] = pares[i + c];
      const x = M + c * colW + 6;
      ctx.page.drawText(san(lab).toUpperCase().slice(0, 34), { x, y: yy - 8, size: 6.5, font: ctx.bold, color: CINZA });
      const linha = quebrar(vl, ctx.font, 9, colW - 16)[0] ?? "";
      ctx.page.drawText(linha, { x, y: yy - 19, size: 9, font: ctx.font, color: PRETO });
    }
    ctx.y -= 24;
  }
}
/** Tabela: header + zebra, até 4 colunas escalares. */
function tabela(ctx: Ctx, registros: Record<string, unknown>[]) {
  const cols = Object.keys(registros[0]).filter((k) => escalarStr(registros[0][k]) !== null).slice(0, 4);
  if (cols.length === 0) return;
  const colW = LU / cols.length;
  garantir(ctx, 16);
  ctx.page.drawRectangle({ x: M, y: ctx.y - 13, width: LU, height: 13, color: HEAD_BG });
  cols.forEach((col, ci) => ctx.page.drawText(san(humaniza(col)).slice(0, 24), { x: M + ci * colW + 5, y: ctx.y - 9.5, size: 7, font: ctx.bold, color: CINZA }));
  ctx.y -= 14;
  registros.slice(0, 25).forEach((reg, ri) => {
    garantir(ctx, 13);
    if (ri % 2 === 1) ctx.page.drawRectangle({ x: M, y: ctx.y - 11, width: LU, height: 11, color: ZEBRA });
    cols.forEach((col, ci) => ctx.page.drawText(san(String(reg[col] ?? "")).slice(0, 28), { x: M + ci * colW + 5, y: ctx.y - 8, size: 7.5, font: ctx.font, color: PRETO }));
    ctx.y -= 12;
  });
  ctx.y -= 6;
}
/** Renderiza uma seção extra pela estrutura: tabela p/ arrays, grid p/ objetos. */
function renderSecaoExtra(ctx: Ctx, label: string, valor: unknown) {
  cabecalhoSecao(ctx, label);
  if (Array.isArray(valor)) {
    const objs = objsDe(valor);
    if (objs.length) tabela(ctx, objs);
    else for (const v of valor) texto(ctx, `- ${val(v)}`, { size: 9, x: M + 8, gap: 2 });
    return;
  }
  if (ehObj(valor)) {
    const pares = paresEscalares(valor);
    if (pares.length) gridFichas(ctx, pares);
    const reg = objsDe(valor.registros);
    if (reg.length) tabela(ctx, reg);
    for (const [k, v] of Object.entries(valor)) {
      if (k === "registros" || k === "num_registros" || k === "quantidade") continue;
      if (ehObj(v)) {
        const sp = paresEscalares(v);
        if (sp.length) { texto(ctx, humaniza(k), { size: 7.5, bold: true, cor: CINZA, x: M + 6, gap: 3 }); gridFichas(ctx, sp); }
      } else if (Array.isArray(v) && objsDe(v).length) {
        texto(ctx, humaniza(k), { size: 7.5, bold: true, cor: CINZA, x: M + 6, gap: 3 });
        tabela(ctx, objsDe(v));
      }
    }
    return;
  }
  texto(ctx, val(valor), { size: 9, x: M + 8, gap: 2 });
}

const CARD_BORDA = rgb(0.88, 0.89, 0.93);
const CARD_BG = rgb(0.985, 0.987, 0.995);
const AMBAR = rgb(0.62, 0.42, 0.05);

const moedaPdf = (v: string): string => (v && v !== "0" && v !== "0,00" && v !== "-" ? `R$ ${v}` : "");

/** Funde protesto/protesto_estadual (a API repete os mesmos registros) — evita dobrar o veredito. */
function fundirProtestosPdf<T extends { chave: string; label: string; valorTotal: string; detalhes: string[] }>(restricoes: T[]): T[] {
  const p = restricoes.find((x) => x.chave === "protesto");
  const pe = restricoes.find((x) => x.chave === "protesto_estadual");
  if (!p || !pe || !p.valorTotal || p.valorTotal !== pe.valorTotal) return restricoes;
  const rico = pe.detalhes.join("").length >= p.detalhes.join("").length ? pe : p;
  const fundido = { ...rico, chave: "protesto", label: "Protesto" } as T;
  return restricoes.flatMap((x) => (x.chave === "protesto" ? [fundido] : x.chave === "protesto_estadual" ? [] : [x]));
}

type OperacaoScrPdf = { modalidade: string; subModalidade: string; valor: string; situacao: string; restritiva: boolean };

/** SCR / Banco Central — operações de crédito (espelha extrairScr do cérebro). */
function extrairScrPdf(res: Record<string, unknown>) {
  const sec = ehObj(res.operacoes) ? res.operacoes : null;
  const regs = sec ? objsDe(sec.registros) : [];
  if (!regs.length) return null;
  const operacoes: OperacaoScrPdf[] = regs.map((op) => {
    const vencSec = ehObj(op.vencimentos) ? op.vencimentos : {};
    const venc = ehObj(vencSec.registros) ? vencSec.registros : {};
    const mod = ehObj(op.modalidade) ? op.modalidade : {};
    const sub = ehObj(op.sub_modalidade) ? op.sub_modalidade : {};
    return {
      modalidade: val(mod.descricao),
      subModalidade: val(sub.descricao),
      valor: moedaPdf(val(op.total)),
      situacao: val(venc.descricao),
      restritiva: val(venc.restritivo) === "1",
    };
  });
  const resumo = ehObj(res.resumo) ? res.resumo : {};
  const consol = ehObj(res.consolidado) ? res.consolidado : {};
  const cv = ehObj(consol.credito_vencido) ? consol.credito_vencido : {};
  return {
    operacoes,
    totalVencido: moedaPdf(val(cv.valor)),
    qtdOperacoes: val(resumo.qtd_operacoes),
    qtdInstituicoes: val(resumo.qtd_instituicoes),
    dataBase: val(resumo.data_base_consultada),
    temRestritiva: operacoes.some((o) => o.restritiva),
  };
}

/** Resumo financeiro consolidado (crédito vencido, prejuízo, limite, a vencer). */
function extrairResumoFinanceiroPdf(res: Record<string, unknown>): { rotulo: string; valor: string; neg: boolean }[] {
  const c = ehObj(res.consolidado) ? res.consolidado : null;
  if (!c) return [];
  const v = (k: string): string => moedaPdf(val(ehObj(c[k]) ? (c[k] as Record<string, unknown>).valor : ""));
  return ([
    ["Credito vencido", v("credito_vencido"), true],
    ["Prejuizo", v("prejuizo"), true],
    ["Limite de credito", v("limite_credito"), false],
    ["Credito a vencer", v("credito_a_vencer"), false],
  ] as [string, string, boolean][])
    .filter(([, vl]) => vl)
    .map(([rotulo, valor, neg]) => ({ rotulo, valor, neg }));
}

/** Visão rápida — sumário de ocorrências do resumo_ocorrencias (só quantidade > 0). */
function extrairVisaoRapidaPdf(res: Record<string, unknown>): { rotulo: string; quantidade: number; valor: string }[] {
  const ro = ehObj(res.resumo_ocorrencias) ? res.resumo_ocorrencias : null;
  if (!ro) return [];
  const LABELS: Record<string, string> = {
    protesto: "Protestos",
    ccf: "Cheques s/ fundo",
    acao: "Ações / processos",
    ccf_interno: "Cheques (interno)",
    registro_scpc_bvs: "SCPC / SPC",
    participacoes_empresas_bvs: "Participação em empresas",
    consultas_anteriores_sintetico_bvs: "Consultas recentes",
  };
  return Object.entries(ro)
    .map(([k, vv]) => {
      const o = ehObj(vv) ? vv : {};
      return { rotulo: LABELS[k] || humaniza(k), quantidade: Number(val(o.quantidade)) || 0, valor: moedaPdf(val(o.valor)) };
    })
    .filter((x) => x.quantidade > 0);
}

/** Fileira de mini-cards (rótulo em cima, valor grande) — cada um uma caixa com borda. */
function gridMiniCards(ctx: Ctx, itens: { rotulo: string; valor: string; sub?: string; cor?: ReturnType<typeof rgb> }[], porLinha = 3) {
  const gap = 8;
  const cardW = (LU - gap * (porLinha - 1)) / porLinha;
  const cardH = 42;
  for (let i = 0; i < itens.length; i += porLinha) {
    garantir(ctx, cardH + 8);
    const yy = ctx.y;
    for (let col = 0; col < porLinha && i + col < itens.length; col++) {
      const it = itens[i + col];
      const x = M + col * (cardW + gap);
      ctx.page.drawRectangle({ x, y: yy - cardH, width: cardW, height: cardH, color: CARD_BG, borderColor: CARD_BORDA, borderWidth: 0.8 });
      ctx.page.drawText(san(it.rotulo).toUpperCase().slice(0, 30), { x: x + 9, y: yy - 14, size: 6.5, font: ctx.bold, color: CINZA });
      ctx.page.drawText(san(it.valor).slice(0, 18), { x: x + 9, y: yy - 32, size: 15, font: ctx.bold, color: it.cor ?? PRETO });
      if (it.sub) ctx.page.drawText(san(it.sub).slice(0, 22), { x: x + 9 + ctx.bold.widthOfTextAtSize(san(it.valor).slice(0, 18), 15) + 6, y: yy - 31, size: 8, font: ctx.font, color: it.cor ?? CINZA });
    }
    ctx.y -= cardH + 8;
  }
}

/** Card de uma operação do SCR (modalidade + valor no topo, sub-modalidade + situação abaixo). */
function cardOperacao(ctx: Ctx, op: OperacaoScrPdf) {
  const h = op.subModalidade && op.situacao ? 46 : 34;
  garantir(ctx, h + 6);
  const yy = ctx.y;
  const cor = op.restritiva ? VERMELHO : MARCA;
  const bg = op.restritiva ? VERMELHO_BG : rgb(0.97, 0.98, 1);
  ctx.page.drawRectangle({ x: M, y: yy - h, width: LU, height: h, color: bg, borderColor: cor, borderWidth: 0.8 });
  ctx.page.drawText(san(op.modalidade || "Operação de crédito").slice(0, 52), { x: M + 10, y: yy - 15, size: 9.5, font: ctx.bold, color: PRETO });
  if (op.valor) {
    const w = ctx.bold.widthOfTextAtSize(san(op.valor), 10.5);
    ctx.page.drawText(san(op.valor), { x: A4.w - M - 10 - w, y: yy - 15, size: 10.5, font: ctx.bold, color: cor });
  }
  let yd = yy - 28;
  if (op.subModalidade) { ctx.page.drawText(san(op.subModalidade).slice(0, 92), { x: M + 10, y: yd, size: 7.5, font: ctx.font, color: CINZA }); yd -= 11; }
  if (op.situacao) ctx.page.drawText(san(op.situacao).slice(0, 92), { x: M + 10, y: yd, size: 7.5, font: ctx.font, color: op.restritiva ? VERMELHO : AMBAR });
  ctx.y -= h + 6;
}

/** Caixa de uma restrição (verde "nada consta" / vermelho "N registros", com detalhes). */
function cardRestricao(ctx: Ctx, r: { label: string; n: number; detalhes: string[]; valorTotal: string }) {
  const ruim = r.n > 0;
  const det = ruim ? r.detalhes.slice(0, 12) : [];
  const linhas = det.length + (ruim && r.valorTotal ? 1 : 0);
  const h = 22 + (linhas ? linhas * 11 + 6 : 0);
  garantir(ctx, h + 6);
  const yy = ctx.y;
  const cor = ruim ? VERMELHO : VERDE;
  const bg = ruim ? VERMELHO_BG : VERDE_BG;
  ctx.page.drawRectangle({ x: M, y: yy - h, width: LU, height: h, color: bg, borderColor: cor, borderWidth: 0.8 });
  ctx.page.drawCircle({ x: M + 15, y: yy - 13, size: 5.5, color: cor });
  ctx.page.drawText(ruim ? "!" : "OK", { x: M + (ruim ? 13.5 : 10.5), y: yy - 15.5, size: ruim ? 8 : 6, font: ctx.bold, color: rgb(1, 1, 1) });
  ctx.page.drawText(san(r.label), { x: M + 28, y: yy - 16, size: 10, font: ctx.bold, color: PRETO });
  const dir = ruim ? `${r.n} registro(s)` : "Nada consta";
  ctx.page.drawText(san(dir), { x: A4.w - M - 10 - ctx.bold.widthOfTextAtSize(san(dir), 9.5), y: yy - 16, size: 9.5, font: ctx.bold, color: cor });
  let yd = yy - 31;
  for (const d of det) { ctx.page.drawText(san(`- ${d}`).slice(0, 96), { x: M + 28, y: yd, size: 8, font: ctx.font, color: CINZA }); yd -= 11; }
  if (ruim && r.valorTotal) ctx.page.drawText(san(`Total: R$ ${r.valorTotal}`), { x: M + 28, y: yd, size: 8.5, font: ctx.bold, color: VERMELHO });
  ctx.y -= h + 6;
}

export async function montarPdfConsulta(c: ConsultaPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, page: doc.addPage([A4.w, A4.h]), y: A4.h - M, font, bold };
  const res = c.resultado ?? {};

  // Normalização (espelha laudo-dados do frontend)
  const info = ehObj(res.informacoes) ? res.informacoes : {};
  const ident = ehObj(info.identificacao) ? info.identificacao : ehObj(res.resumo) ? res.resumo : {};
  const local = ehObj(info.localizacao) ? info.localizacao : {};
  const restricoes = fundirProtestosPdf(
    Object.keys(RESTRICOES).filter((k) => k in res && qtd(res[k]) != null).map((k) => {
      const sec = ehObj(res[k]) ? (res[k] as Record<string, unknown>) : {};
      const detalhes = objsDe(sec.registros).map((reg) => {
        const v = escalarStr(reg.valor);
        const valorStr = v ? `${escalarStr(reg.moeda) ?? "R$"} ${v}` : "";
        const loc = [escalarStr(reg.cidade), escalarStr(reg.uf)].filter(Boolean).join("/");
        const cart = escalarStr(reg.cartorio);
        return [valorStr, escalarStr(reg.data), loc, cart && cart !== "UN" ? `cartorio ${cart}` : "", escalarStr(reg.tipo)].filter(Boolean).join(" . ");
      }).filter(Boolean);
      const valorTotal = ehObj(sec.informacoes) ? (escalarStr((sec.informacoes as Record<string, unknown>).valor_total) ?? "") : "";
      return { chave: k, label: RESTRICOES[k], n: qtd(res[k]) ?? 0, detalhes, valorTotal };
    }),
  );
  const totalApont = restricoes.reduce((s, x) => s + x.n, 0);
  const limpo = totalApont === 0 && restricoes.length > 0;
  const s6 = ehObj(res.score_6_meses) ? res.score_6_meses : null;
  const sc = ehObj(res.score) ? res.score : null;
  const pontuacao = val(s6?.score) || val(sc?.pontuacao);
  const classe = val(s6?.classe_risco) || val(sc?.faixa);
  const probInad = val(s6?.probabilidade_inadimplencia);
  const scoreSecundario = s6 && sc && val(sc.pontuacao) ? { pontuacao: val(sc.pontuacao), classe: val(sc.faixa) } : null;
  const renda = ehObj(res.renda_presumida_bvs) ? val(res.renda_presumida_bvs.texto) : "";
  const nome = val(ident.nome) || c.nome_empresa || "Documento consultado";
  const docConsultado = val(ident.cpf) || val(ident.cnpj) || c.documento || "";
  const scr = extrairScrPdf(res);
  const resumoFin = extrairResumoFinanceiroPdf(res);
  const visaoRapida = extrairVisaoRapidaPdf(res);

  // "Outras informações": tudo que as seções curadas do PDF não renderizam (nunca descarta dado).
  const consumidasPdf = new Set<string>([
    "informacoes", "resumo", "score", "score_6_meses", "renda_presumida_bvs", "mensagem",
    "operacoes", "consolidado", "resumo_ocorrencias", "positivo",
    ...Object.keys(RESTRICOES),
  ]);
  const extras = Object.keys(res)
    .filter((k) => !consumidasPdf.has(k))
    .map((k) => ({ label: humaniza(k), valor: res[k] }))
    .filter((e) => acharLinhas(e.valor).length > 0);

  // ---- Cabeçalho do tenant: banner full-width no topo, logo + nome centralizados abaixo ----
  const banner = await embImg(doc, c.banner_url, 900);
  const logo = await embImg(doc, c.logo_url, 240);
  let topo = A4.h - M;

  if (banner) {
    const bh = Math.min((A4.w * banner.height) / banner.width, 150);
    ctx.page.drawImage(banner, { x: 0, y: A4.h - bh, width: A4.w, height: bh });
    topo = A4.h - bh - 18;
  }
  if (logo) {
    const lh = 46;
    const lw = Math.min((logo.width / logo.height) * lh, 170);
    ctx.page.drawImage(logo, { x: (A4.w - lw) / 2, y: topo - lh, width: lw, height: lh });
    topo -= lh + 10;
  }
  const nomeEmp = san(c.nome_empresa ?? "Consulta de Crédito");
  const nomeW = bold.widthOfTextAtSize(nomeEmp, 17);
  ctx.page.drawText(nomeEmp, { x: (A4.w - nomeW) / 2, y: topo - 16, size: 17, font: bold, color: MARCA });
  topo -= 24;
  const sub = san("Relatório de consulta de crédito");
  const subW = font.widthOfTextAtSize(sub, 10);
  ctx.page.drawText(sub, { x: (A4.w - subW) / 2, y: topo - 12, size: 10, font, color: CINZA });
  topo -= 22;
  ctx.page.drawLine({ start: { x: M, y: topo }, end: { x: A4.w - M, y: topo }, thickness: 0.5, color: LINHA });
  ctx.y = topo - 20;

  // ---- Identidade (caixa) ----
  {
    const idLinha = [docConsultado && `${(c.tipo_doc ?? "doc").toUpperCase()}: ${docConsultado}`, val(ident.data_nascimento) && `Nasc.: ${val(ident.data_nascimento)}`, val(ident.situacao_cpf) && `Situacao: ${val(ident.situacao_cpf)}`, (val(local.cidade) || val(local.uf)) && `${val(local.cidade)}${val(local.uf) ? "/" + val(local.uf) : ""}`].filter(Boolean).join("   |   ");
    const h = idLinha ? 50 : 34;
    garantir(ctx, h + 8);
    const yy = ctx.y;
    ctx.page.drawRectangle({ x: M, y: yy - h, width: LU, height: h, color: CARD_BG, borderColor: CARD_BORDA, borderWidth: 0.8 });
    ctx.page.drawText(san(nome).slice(0, 60), { x: M + 12, y: yy - 22, size: 15, font: bold, color: PRETO });
    if (idLinha) ctx.page.drawText(san(idLinha).slice(0, 110), { x: M + 12, y: yy - 39, size: 9, font, color: CINZA });
    ctx.y -= h + 10;
  }

  // ---- Selo de veredito ----
  const selH = 46;
  garantir(ctx, selH + 12);
  const corV = limpo ? VERDE : totalApont > 0 ? VERMELHO : CINZA;
  const corVbg = limpo ? VERDE_BG : totalApont > 0 ? VERMELHO_BG : rgb(0.95, 0.95, 0.96);
  ctx.page.drawRectangle({ x: M, y: ctx.y - selH, width: LU, height: selH, color: corVbg, borderColor: corV, borderWidth: 1 });
  ctx.page.drawCircle({ x: M + 26, y: ctx.y - selH / 2, size: 11, color: corV });
  ctx.page.drawText(limpo ? "OK" : totalApont > 0 ? "!" : "-", { x: M + (limpo ? 19 : 23), y: ctx.y - selH / 2 - 5, size: 13, font: bold, color: rgb(1, 1, 1) });
  ctx.page.drawText(san(limpo ? "Nome limpo" : totalApont > 0 ? `${totalApont} apontamento(s)` : "Sem dados de restrição"), { x: M + 48, y: ctx.y - 19, size: 14, font: bold, color: corV });
  ctx.page.drawText(san(limpo ? "Nenhuma restrição nas bases consultadas." : totalApont > 0 ? "Veja o detalhamento das restrições abaixo." : "As bases de restrição não retornaram registros."), { x: M + 48, y: ctx.y - 35, size: 9, font, color: CINZA });
  ctx.y -= selH + 18;

  // ---- Score (card) + score auxiliar ----
  if (pontuacao) {
    const h = scoreSecundario ? 62 : 48;
    garantir(ctx, h + 12);
    const yy = ctx.y;
    ctx.page.drawRectangle({ x: M, y: yy - h, width: LU, height: h, color: rgb(0.96, 0.97, 1), borderColor: LINHA, borderWidth: 1 });
    ctx.page.drawText("SCORE DE CRÉDITO", { x: M + 14, y: yy - 16, size: 8, font: bold, color: CINZA });
    ctx.page.drawText(san(pontuacao), { x: M + 14, y: yy - 40, size: 22, font: bold, color: MARCA });
    const dx = M + 14 + bold.widthOfTextAtSize(san(pontuacao), 22) + 12;
    const detalhe = [classe && `Classe ${classe}`, probInad && `Inadimplência: ${probInad}`, renda && `Renda presumida: ${renda}`].filter(Boolean).join("    ");
    if (detalhe) ctx.page.drawText(san(detalhe), { x: dx, y: yy - 34, size: 9, font, color: PRETO });
    if (scoreSecundario) ctx.page.drawText(san(`Score auxiliar: ${scoreSecundario.pontuacao}${scoreSecundario.classe ? " . " + scoreSecundario.classe : ""}`), { x: M + 14, y: yy - 54, size: 8, font, color: CINZA });
    ctx.y -= h + 16;
  }

  // ---- Visão rápida (mini-cards) ----
  if (visaoRapida.length) {
    cabecalhoSecao(ctx, "Visao rapida");
    gridMiniCards(ctx, visaoRapida.map((vr) => ({ rotulo: vr.rotulo, valor: String(vr.quantidade), sub: vr.valor, cor: vr.quantidade > 0 ? VERMELHO : PRETO })), 3);
    ctx.y -= 4;
  }

  // ---- Restrições (caixas) ----
  if (restricoes.length) {
    cabecalhoSecao(ctx, "Restrições verificadas");
    for (const r of restricoes) cardRestricao(ctx, r);
    ctx.y -= 4;
  }

  // ---- SCR · Banco Central (operações de crédito) ----
  if (scr) {
    cabecalhoSecao(ctx, "SCR . Banco Central");
    if (scr.totalVencido) {
      garantir(ctx, 16);
      ctx.page.drawText(san(`Total vencido: ${scr.totalVencido}`), { x: M, y: ctx.y - 4, size: 10, font: bold, color: VERMELHO });
      ctx.y -= 16;
    }
    for (const op of scr.operacoes) cardOperacao(ctx, op);
    const meta = [scr.qtdOperacoes && `${scr.qtdOperacoes} operacoes`, scr.qtdInstituicoes && `${scr.qtdInstituicoes} instituicao(oes)`, scr.dataBase && `base ${scr.dataBase}`].filter(Boolean).join(" . ");
    if (meta) { garantir(ctx, 14); ctx.page.drawText(san(meta), { x: M, y: ctx.y - 3, size: 8, font, color: CINZA }); ctx.y -= 14; }
    ctx.y -= 4;
  }

  // ---- Resumo financeiro (mini-cards) ----
  if (resumoFin.length) {
    cabecalhoSecao(ctx, "Resumo financeiro");
    gridMiniCards(ctx, resumoFin.map((rf) => ({ rotulo: rf.rotulo, valor: rf.valor, cor: rf.neg ? VERMELHO : PRETO })), 2);
    ctx.y -= 4;
  }

  // ---- Dados cadastrais ----
  const cad: Array<[string, string]> = [];
  for (const k of CAMPOS_IDENT) if (val(ident[k]).trim()) cad.push([humaniza(k), val(ident[k])]);
  for (const k of CAMPOS_LOCAL) if (val(local[k]).trim()) cad.push([humaniza(k), val(local[k])]);
  if (cad.length) {
    cabecalhoSecao(ctx, "Dados cadastrais");
    gridFichas(ctx, cad);
    ctx.y -= 8;
  }

  // ---- Outras informações (estruturado: tabela p/ arrays, grid p/ objetos) ----
  if (extras.length) {
    ctx.y -= 4;
    for (const e of extras) renderSecaoExtra(ctx, e.label, e.valor);
  }

  // ---- Rodapé em todas as páginas ----
  const total = doc.getPageCount();
  const dataStr = c.consultada_em && !isNaN(new Date(c.consultada_em).getTime()) ? new Date(c.consultada_em).toLocaleString("pt-BR") : "";
  const rod = san(`Emitido por ${c.nome_empresa ?? "Plataforma"}${dataStr ? " . " + dataStr : ""} . ref ${c.chave_publica.slice(0, 8)} . via Plataforma Limpa`);
  doc.getPages().forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 14 }, end: { x: A4.w - M, y: M + 14 }, thickness: 0.5, color: LINHA });
    p.drawText(rod, { x: M, y: M + 4, size: 7, font, color: rgb(0.55, 0.55, 0.6) });
    p.drawText(`${i + 1}/${total}`, { x: A4.w - M - 18, y: M + 4, size: 7, font, color: rgb(0.55, 0.55, 0.6) });
  });

  return await doc.save();
}
