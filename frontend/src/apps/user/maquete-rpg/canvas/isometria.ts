/**
 * isometria.ts — projeção ISOMÉTRICA real (diamond 2:1).
 *
 * Conversões:
 *   screenX = (col - lin) * (TW/2) + OFFSET_X
 *   screenY = (col + lin) * (TH/2)
 *
 * - TW = 32, TH = 16 (losango clássico 2:1).
 * - OFFSET_X desloca o mundo pra direita o suficiente pra que col=0, lin=LINHAS
 *   fique em x=0 (sem coordenadas negativas em X).
 * - Y começa em 0 no topo (col=0, lin=0) e cresce pra baixo.
 *
 * Para sprites top-down (billboards) usamos `logicoParaIso(px, py)`:
 * convertemos o pixel lógico (1 tile lógico = 16 px) em col/lin fracionários
 * e projetamos. O sprite usa anchor (0.5, 1) e fica "de pé" sobre o losango.
 */

import { COLUNAS, LINHAS, TAMANHO_TILE_LOGICO } from "./gridConstantes";

/** Largura do losango (eixo X da tela). */
export const ISO_TW = 32;
/** Altura do losango (eixo Y da tela). */
export const ISO_TH = 16;

const HW = ISO_TW / 2; // 16
const HH = ISO_TH / 2; // 8

/** Folga pra paredes na lateral norte/oeste e mobiliário alto. */
const PAD_TOP = 64;

/** Desloca o mundo pra direita: garante que (col=0, lin=LINHAS) caia em x≈0. */
export const OFFSET_X = LINHAS * HW;
/** Desloca pra baixo deixando espaço pras paredes/mobília extrudida. */
export const OFFSET_Y = PAD_TOP;

/** Tamanho total da viewport lógica do mundo. */
export const ISO_LARGURA_MAPA = (COLUNAS + LINHAS) * HW;
export const ISO_ALTURA_MAPA = (COLUNAS + LINHAS) * HH + PAD_TOP + 32;

/** Projeta (col, lin) fracionários para o CENTRO do losango. */
export function isoCentro(col: number, lin: number): { x: number; y: number } {
  return {
    x: (col - lin) * HW + OFFSET_X + HW,
    y: (col + lin) * HH + OFFSET_Y + HH,
  };
}

/** Topo do losango (col, lin) — vértice norte. */
export function isoTopo(col: number, lin: number): { x: number; y: number } {
  return {
    x: (col - lin) * HW + OFFSET_X + HW,
    y: (col + lin) * HH + OFFSET_Y,
  };
}

/** Vértice sul do losango (onde o sprite billboard se apoia). */
export function isoBase(col: number, lin: number): { x: number; y: number } {
  return {
    x: (col - lin) * HW + OFFSET_X + HW,
    y: (col + lin) * HH + OFFSET_Y + ISO_TH,
  };
}

/** Canto NW da bounding-box de um tile (canto OESTE do diamante). */
export function isoOeste(col: number, lin: number): { x: number; y: number } {
  return {
    x: (col - lin) * HW + OFFSET_X,
    y: (col + lin) * HH + OFFSET_Y + HH,
  };
}

/** Canto LESTE do diamante. */
export function isoLeste(col: number, lin: number): { x: number; y: number } {
  return {
    x: (col - lin) * HW + OFFSET_X + ISO_TW,
    y: (col + lin) * HH + OFFSET_Y + HH,
  };
}

/* ---------- Compat: nomes antigos ainda usados no resto do código ---------- */
export function tileParaIso(col: number, lin: number) {
  // canto NW da bounding-box (compat com versões antigas)
  return { x: (col - lin) * HW + OFFSET_X, y: (col + lin) * HH + OFFSET_Y };
}
export function tileCentroIso(col: number, lin: number) {
  return isoCentro(col, lin);
}
export function tileBaseIso(col: number, lin: number) {
  return isoBase(col, lin);
}

/**
 * Converte pixel LÓGICO (escala 16 px/tile, top-down) → pixel de TELA isométrico.
 * Bonecos guardam posição em px lógico; aqui projetamos no espaço iso.
 */
export function logicoParaIso(px: number, py: number): { x: number; y: number } {
  const col = px / TAMANHO_TILE_LOGICO;
  const lin = py / TAMANHO_TILE_LOGICO;
  // isoTopo(c, l) é a projeção EXATA do ponto contínuo (c, l). Antes usava
  // isoBase, que joga o ponto 1 tile pro sudeste — o boneco sentado na cadeira
  // aparecia do lado da mesa, e não atrás dela olhando pro monitor.
  return isoTopo(col, lin);
}

/** Profundidade pra depth-sort: sul-leste fica por cima. */
export function profundidade(col: number, lin: number): number {
  return col + lin;
}

/* -------------------- Helpers de desenho pra MapaEmpresa -------------------- */

/** Polígono losango cobrindo o tile (col, lin) com w×h footprint. */
export function pontosLosango(
  col: number,
  lin: number,
  w = 1,
  h = 1,
): number[] {
  const n = isoTopo(col, lin);                        // norte
  const l = isoLeste(col + w - 1, lin);               // leste
  const s = isoBase(col + w - 1, lin + h - 1);        // sul
  const o = isoOeste(col, lin + h - 1);               // oeste
  return [n.x, n.y, l.x, l.y, s.x, s.y, o.x, o.y];
}

/**
 * Devolve os 4 cantos do topo de um BOX iso (footprint w×h tiles) elevado
 * em `altura` pixels.  Útil pra desenhar móveis volumétricos.
 */
export function pontosTopoBox(
  col: number,
  lin: number,
  w: number,
  h: number,
  altura: number,
): { topo: number[]; base: number[] } {
  const norteB = isoTopo(col, lin);
  const lesteB = isoLeste(col + w - 1, lin);
  const sulB = isoBase(col + w - 1, lin + h - 1);
  const oesteB = isoOeste(col, lin + h - 1);
  const base = [
    norteB.x, norteB.y,
    lesteB.x, lesteB.y,
    sulB.x, sulB.y,
    oesteB.x, oesteB.y,
  ];
  const topo = base.map((v, i) => (i % 2 === 1 ? v - altura : v));
  return { topo, base };
}
