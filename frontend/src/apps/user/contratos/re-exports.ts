/**
 * Barrel de re-exports para as abas.
 * Centraliza imports de tipos e componentes compartilhados
 * para manter cada aba limpa e sem imports duplicados.
 */

// Tipos e helpers de dados
export type {
  Contrato,
  FiltroOrigem,
  FiltroStatus,
  OpcaoParcelamento,
  ProdutoResumo,
  RecursosEditaveis,
  SupabaseBruto,
  TemplateContrato,
  ToastApi,
} from "./tipos";
export {
  badgeOrigem,
  badgeStatus,
  COLUNAS,
  inputStyle,
  nomeContato,
  pegarToast,
  statusAssinado,
  statusRejeitado,
  statusValidar,
} from "./tipos";

// Componentes de UI compartilhados
export { BotaoIcone, Campo, CardKpi, FiltroPilulas, Linha, Vazio } from "./ui-contratos";
