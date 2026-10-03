/**
 * Tamanho inicial da janela ao abrir um app.
 *
 * Cada app declara um tamanho "natural" no registro (ex.: 1280×800). Em telas
 * menores que esse natural, abrir no tamanho cru estoura a viewport e corta o
 * rodapé do conteúdo. Aqui a janela é escalada proporcionalmente até CABER —
 * moldura e conteúdo encolhem juntos via `zoom`, sem cortar nada nem forçar
 * scroll. É o mesmo modelo do resize-por-canto (`zoomCanto.ts`): o `zoom`
 * inicial já é aplicado no render da Janela, e `baseW/baseH` seguem sendo o
 * 100% (preserva o resize-por-canto a partir deste estado).
 *
 * Função pura: zero DOM. Testada em `tamanhoInicial.test.ts`.
 */

/** Respiro reservado no topo (barra de topo do OS + folga). */
export const MARGEM_TOPO_JANELA = 64;
/** Respiro nas laterais e no rodapé. */
export const MARGEM_BORDA_JANELA = 24;

export interface EntradaTamanhoInicial {
  /** Tamanho natural do app (= 100% de zoom). */
  baseW: number;
  baseH: number;
  /** Viewport disponível. */
  vw: number;
  vh: number;
  margemTopo?: number;
  margemBorda?: number;
}

export interface SaidaTamanhoInicial {
  /** Tamanho da moldura já clampado à tela. */
  w: number;
  h: number;
  /** Escala do conteúdo (1 = natural; <1 = encolhido pra caber). */
  zoom: number;
}

/**
 * Calcula o tamanho de abertura cabendo na viewport. A escala nunca passa de 1
 * (telas grandes abrem no tamanho natural) e encolhe o necessário em telas
 * menores. O eixo mais apertado manda — aspecto preservado.
 */
export function calcularTamanhoInicial(e: EntradaTamanhoInicial): SaidaTamanhoInicial {
  const margemTopo = e.margemTopo ?? MARGEM_TOPO_JANELA;
  const margemBorda = e.margemBorda ?? MARGEM_BORDA_JANELA;

  const maxW = Math.max(1, e.vw - margemBorda * 2);
  const maxH = Math.max(1, e.vh - margemTopo - margemBorda);

  const escala = Math.min(1, maxW / e.baseW, maxH / e.baseH);

  return {
    w: Math.round(e.baseW * escala),
    h: Math.round(e.baseH * escala),
    zoom: escala,
  };
}
