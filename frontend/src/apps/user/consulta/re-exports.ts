/**
 * Barrel de re-exports para as abas do app Consulta.
 * Centraliza imports de tipos e componentes compartilhados
 * para manter cada aba limpa e sem imports duplicados.
 */

// Tipos e helpers de dados
export type {
  Aba,
  Consulta,
  FiltroOrigem,
  FiltroStatus,
  MovimentoCarteira,
  PacoteCredito,
  Recarga,
  SupabaseBruto,
  TipoConsulta,
  ToastApi,
} from "./tipos";
export {
  badgeOrigem,
  badgeStatus,
  detectarTipoDoc,
  formatBRL,
  inputStyle,
  mascaraDoc,
  nomeContato,
  pegarToast,
} from "./tipos";

// Componentes de UI compartilhados
export { BotaoIcone, Campo, CardKpi, FiltroPilulas, Linha, Vazio } from "./ui-consulta";
