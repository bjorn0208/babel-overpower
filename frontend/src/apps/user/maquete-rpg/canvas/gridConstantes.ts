/**
 * gridConstantes — dimensões lógicas da grid da maquete.
 *
 * Mantemos as constantes da grid lógica num módulo separado pra evitar
 * ciclo de import entre `MapaEmpresa.tsx` (que renderiza) e `isometria.ts`
 * (que projeta). Ambos importam daqui.
 */

export const COLUNAS = 40;
export const LINHAS = 25;
/** Lado do tile lógico (px), preservado pra compatibilidade com simulacao.ts. */
export const TAMANHO_TILE_LOGICO = 16;
