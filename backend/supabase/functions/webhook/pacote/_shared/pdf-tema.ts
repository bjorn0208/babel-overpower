/**
 * _shared/pdf-tema.ts — tokens visuais dos PDFs da plataforma.
 *
 * Fonte única de cor, escala tipográfica, espaçamento e grid. O documento que
 * explica o porquê de cada escolha é `documentos/plataforma/design-system-relatorios-pdf.md`
 * (referência cravada pelo Theus em 2026-08-11). Mudou aqui, atualiza lá.
 *
 * Nada de número mágico no montador: se um valor visual aparece duas vezes,
 * ele vira token aqui.
 */

import { rgb } from "npm:pdf-lib@1.17.1";

/** A4 retrato em pontos. */
export const PAGINA = { largura: 595.28, altura: 841.89 } as const;

/** Margem única nos quatro lados + faixa útil derivada. */
export const MARGEM = 48;
export const UTIL = PAGINA.largura - MARGEM * 2;

/** Escala de espaçamento — usar só estes degraus. */
export const ESPACO = { xs: 4, sm: 8, md: 12, lg: 18, xl: 26, xxl: 36 } as const;

/** Paleta. HEX equivalente documentado no design system. */
export const COR = {
  marca: rgb(0.129, 0.322, 0.659), // #2152A8
  marcaEscura: rgb(0.090, 0.227, 0.471), // #173A78
  texto: rgb(0.118, 0.118, 0.149), // #1E1E26
  textoSuave: rgb(0.420, 0.420, 0.478), // #6B6B7A
  linha: rgb(0.859, 0.859, 0.902), // #DBDBE6
  cardFundo: rgb(0.957, 0.965, 0.988), // #F4F6FC
  zebra: rgb(0.976, 0.980, 0.988), // #F9FAFC
  tabelaCabecalho: rgb(0.910, 0.929, 0.973), // #E8EDF8
  positivo: rgb(0.118, 0.478, 0.275), // #1E7A46
  negativo: rgb(0.702, 0.149, 0.118), // #B3261E
  /** Fundos de veredito — usados no laudo de consulta (nada consta / restrição). */
  positivoFundo: rgb(0.902, 0.961, 0.925), // #E6F5EC
  negativoFundo: rgb(0.980, 0.922, 0.922), // #FAEBEB
  /** Redesign premium 2026-08-11 — banda de capa e destaque invertido. */
  tinta: rgb(0.055, 0.078, 0.125), // #0E1420 — azul-noite quase preto
  tintaTexto: rgb(1, 1, 1), // branco puro sobre a tinta
  tintaSuave: rgb(0.624, 0.706, 0.847), // #9FB4D8 — caps da empresa na banda
  trilho: rgb(0.933, 0.945, 0.973), // #EEF1F8 — trilho atrás da barra do gráfico
} as const;

/** Escala tipográfica: tamanho + entrelinha (multiplicador do tamanho). */
export const TIPO = {
  titulo: { tamanho: 24, entrelinha: 1.25 },
  /** Capa do relatório premium — título maior que o `titulo` dos demais PDFs. */
  capa: { tamanho: 28, entrelinha: 1.2 },
  subtitulo: { tamanho: 11.5, entrelinha: 1.45 },
  empresa: { tamanho: 9, entrelinha: 1.35 },
  secao: { tamanho: 12.5, entrelinha: 1.35 },
  /** Título de seção editorial: caixa alta com tracking (redesign 2026-08-11). */
  secaoCaps: { tamanho: 10.5, entrelinha: 1.4 },
  corpo: { tamanho: 10, entrelinha: 1.55 },
  kpiValor: { tamanho: 24, entrelinha: 1.2 },
  kpiRotulo: { tamanho: 7.5, entrelinha: 1.3 },
  tabela: { tamanho: 8.5, entrelinha: 1.3 },
  micro: { tamanho: 7.5, entrelinha: 1.3 },
} as const;

/** Medidas dos blocos. */
export const BLOCO = {
  cardAltura: 78,
  cardRespiro: 12,
  /** Piso da fonte do valor do KPI: encolhe até aqui antes de cortar o número. */
  kpiValorMin: 13,
  /** Filete de acento no topo do card de KPI (redesign 2026-08-11). */
  cardFilete: 2.5,
  /** Banda de tinta da capa quando o tenant não tem banner. */
  bandaAltura: 150,
  cardsPorLinhaAte2: 2,
  cardsPorLinha: 3,
  graficoAltura: 180,
  graficoDivisoes: 4,
  /** Faixa do eixo de valores: cresce com o rótulo, entre estes limites. */
  graficoEixoMin: 36,
  graficoEixoMax: 72,
  barraMin: 28,
  barraMax: 64,
  /** Espaço entre barras como fração da largura da barra. */
  barraFolga: 0.4,
  tabelaLinha: 18,
  logoAlturaMax: 52,
  bannerAlturaMax: 140,
  reguaMarca: 2.5,
} as const;

/** Avanço vertical de uma linha de texto — nunca usar valor fixo. */
export function alturaLinha(nivel: { tamanho: number; entrelinha: number }): number {
  return nivel.tamanho * nivel.entrelinha;
}

/**
 * pdf-lib com fonte padrão só codifica WinAnsi. Acento pt-BR passa; aspas
 * curvas, travessão e emoji viram equivalente ASCII ou somem.
 */
export function sanear(t: unknown): string {
  return String(t ?? "")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    // O bullet (0x95) existe no WinAnsi e sumiria na faxina de fora-de-range.
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF•]/g, "");
}

/**
 * Direção de um indicador pela leitura do texto da variação.
 * Só a NOTA ganha cor — o número principal do KPI é sempre da marca.
 */
export function corDaVariacao(texto: string | null | undefined): typeof COR.positivo | null {
  const t = String(texto ?? "").toLowerCase().trim();
  if (!t) return null;
  if (/^\+/.test(t) || /\b(alta|cresc\w*|ganho|acima|melhor|subiu|aumento)\b/.test(t)) return COR.positivo;
  if (/^-\s*\d/.test(t) || /\b(queda|baixa|perda|abaixo|pior|caiu|redu\w*)\b/.test(t)) return COR.negativo;
  return null;
}

/** Coluna majoritariamente numérica alinha à direita (dinheiro, %, contagem). */
export function colunaNumerica(celulas: (string | number | null)[]): boolean {
  const preenchidas = celulas.filter((c) => String(c ?? "").trim() !== "");
  if (preenchidas.length === 0) return false;
  const numericas = preenchidas.filter((c) =>
    /^[R$\s]*[-+]?[\d.,]+\s*%?$/.test(String(c).trim())
  );
  return numericas.length / preenchidas.length >= 0.7;
}

/**
 * Teto "bonito" pro eixo do gráfico. Degraus finos de propósito: arredondar
 * 56 para 100 achatava as barras na metade de baixo do desenho.
 */
export function tetoDoEixo(maximo: number): number {
  if (!Number.isFinite(maximo) || maximo <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(maximo)));
  const normalizado = maximo / magnitude;
  const degraus = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const passo = degraus.find((d) => normalizado <= d + 1e-9) ?? 10;
  return passo * magnitude;
}

/** Número curto pro eixo: 1.2k, 38k, 1.4M — eixo cheio de zero polui. */
export function abreviar(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `${(valor / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(valor / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
