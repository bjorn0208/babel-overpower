/**
 * Zoom de conteúdo ao redimensionar janela do OS pelo CANTO (diagonal).
 *
 * Regra (decisão Theus 2026-05-18):
 *  - Canto (ne/nw/se/sw): proporção travada — moldura + conteúdo escalam
 *    juntos. `zoom = largura ÷ tamanho padrão do app`. Letra re-desenha
 *    nítida (Janela aplica CSS `zoom` no conteúdo, não `transform`).
 *  - Borda (n/s/e/w): NÃO passa por aqui — caminho de resize livre atual,
 *    só esconde/revela conteúdo.
 *
 * Função pura: zero DOM. Testada em `zoomCanto.test.ts`.
 */

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.5;

/** Canto = 2 letras (ne/nw/se/sw). Borda = 1 letra. Vazio = nada. */
export function ehCanto(dir: string): boolean {
  return dir.length === 2;
}

export interface EntradaResizeCanto {
  /** Direção do handle: "ne" | "nw" | "se" | "sw". */
  dir: string;
  /** Deslocamento do ponteiro desde o início do drag. */
  dx: number;
  dy: number;
  /** Posição/tamanho da janela no início do drag. */
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  /** Tamanho padrão do app (= 100% de zoom). */
  baseW: number;
  baseH: number;
  zoomMin?: number;
  zoomMax?: number;
}

export interface SaidaResizeCanto {
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
}

/**
 * Calcula nova posição/tamanho/zoom para um drag de canto com
 * proporção travada no aspecto base (baseW/baseH). Os dois eixos do
 * ponteiro contribuem (sensação de diagonal), depois o aspecto é
 * reimposto a partir do zoom — então w/h nunca distorcem.
 */
export function calcularResizeCanto(e: EntradaResizeCanto): SaidaResizeCanto {
  const zoomMin = e.zoomMin ?? ZOOM_MIN;
  const zoomMax = e.zoomMax ?? ZOOM_MAX;

  const leste = e.dir.includes("e");
  const sul = e.dir.includes("s");

  // Intenção de cada eixo no sentido "crescer".
  const intencaoW = leste ? e.dx : -e.dx;
  const intencaoH = sul ? e.dy : -e.dy;

  // Largura candidata pelos dois eixos; a altura é convertida em largura
  // pelo aspecto base, e tira-se a média (drag diagonal natural).
  const larguraPorW = e.origW + intencaoW;
  const larguraPorH = (e.origH + intencaoH) * (e.baseW / e.baseH);
  let novoW = (larguraPorW + larguraPorH) / 2;

  // Zoom = razão largura/base, dentro do limite.
  let zoom = novoW / e.baseW;
  zoom = Math.min(zoomMax, Math.max(zoomMin, zoom));

  // Reimpõe w/h a partir do zoom (aspecto exato + respeita o clamp).
  novoW = e.baseW * zoom;
  const novoH = e.baseH * zoom;

  // Ancora o lado oposto ao handle (canto agarrado é o que se move).
  const novoX = e.dir.includes("w") ? e.origX + (e.origW - novoW) : e.origX;
  const novoY = e.dir.includes("n") ? e.origY + (e.origH - novoH) : e.origY;

  return { x: novoX, y: novoY, w: novoW, h: novoH, zoom };
}
