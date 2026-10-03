export { Janela } from "./Janela";
export {
  detectarBordaJanela,
  CURSORES_RESIZE,
  MARGEM_RESIZE,
  MARGEM_RESIZE_INTERNA,
  MARGEM_RESIZE_CANTO,
  MIN_JANELA_W,
  MIN_JANELA_H,
  type DirecaoResize,
} from "./detectarBorda";
export {
  ehCanto,
  calcularResizeCanto,
  ZOOM_MIN,
  ZOOM_MAX,
  type EntradaResizeCanto,
  type SaidaResizeCanto,
} from "./zoomCanto";
export {
  calcularTamanhoInicial,
  MARGEM_TOPO_JANELA,
  MARGEM_BORDA_JANELA,
  type EntradaTamanhoInicial,
  type SaidaTamanhoInicial,
} from "./tamanhoInicial";
