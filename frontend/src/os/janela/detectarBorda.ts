/**
 * Helpers de detecção de borda da Janela.
 *
 * Lógica preservada de bundle.jsx:447-472 (assimétrica: faixa larga FORA
 * da janela pra facilitar pegar a borda, faixa estreita DENTRO pra não
 * bloquear scrollbar).
 */

export const MIN_JANELA_W = 260;
export const MIN_JANELA_H = 220;
export const MARGEM_RESIZE = 24; // até 24px fora pega a borda
// 2026-05-18 v2: faixa interna 14 → 22 (Theus: ainda tava limitado).
export const MARGEM_RESIZE_INTERNA = 22;
// Canto usa faixa MAIOR que a borda — a diagonal é alvo pequeno e agora
// também aciona o zoom, então tem que ser bem fácil de agarrar.
export const MARGEM_RESIZE_CANTO = 40;

export type DirecaoResize =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw"
  | "";

export const CURSORES_RESIZE: Record<Exclude<DirecaoResize, "">, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

interface RetanguloJanela {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function detectarBordaJanela(
  px: number,
  py: number,
  janela: RetanguloJanela,
  margem: number = MARGEM_RESIZE,
): DirecaoResize {
  const bordaFora = margem;
  const bordaDentro = Math.min(MARGEM_RESIZE_INTERNA, margem);
  const cantoFora = Math.max(margem, MARGEM_RESIZE_CANTO);
  const cantoDentro = MARGEM_RESIZE_CANTO;
  const { left, right, top, bottom } = janela;

  const dEsq = px - left; // <0 fora à esquerda
  const dDir = right - px; // <0 fora à direita
  const dTopo = py - top; // <0 fora acima
  const dBaixo = bottom - py; // <0 fora abaixo

  const naFaixa = (d: number, fora: number, dentro: number) =>
    d < 0 ? -d <= fora : d <= dentro;

  // Canto primeiro: faixa generosa nos DOIS eixos (diagonal fácil de pegar).
  const cEsq = naFaixa(dEsq, cantoFora, cantoDentro);
  const cDir = naFaixa(dDir, cantoFora, cantoDentro);
  const cTopo = naFaixa(dTopo, cantoFora, cantoDentro);
  const cBaixo = naFaixa(dBaixo, cantoFora, cantoDentro);
  const vCanto = cTopo ? "n" : cBaixo ? "s" : "";
  const hCanto = cEsq ? "w" : cDir ? "e" : "";
  if (vCanto && hCanto) return `${vCanto}${hCanto}` as DirecaoResize;

  // Borda: faixa mais estreita, um eixo só.
  const bEsq = naFaixa(dEsq, bordaFora, bordaDentro);
  const bDir = naFaixa(dDir, bordaFora, bordaDentro);
  const bTopo = naFaixa(dTopo, bordaFora, bordaDentro);
  const bBaixo = naFaixa(dBaixo, bordaFora, bordaDentro);
  const vBorda = bTopo ? "n" : bBaixo ? "s" : "";
  const hBorda = bEsq ? "w" : bDir ? "e" : "";
  return `${vBorda}${hBorda}` as DirecaoResize;
}
