/**
 * Barrel de re-exports do app Campanha.
 *
 * Mesmo padrão do app Contratos: centraliza tipos + helpers + componentes
 * compartilhados pra manter cada arquivo limpo e sem imports duplicados.
 */

// Tipos do banco
export type {
  AbaCampanha,
  AbaVisao,
  Campanha,
  CriterioFiltro,
  EstadoLeadCampanha,
  FaseCampanha,
  FiltroStatus,
  FiltroTipo,
  FiltrosCampanha,
  KpiCampanha,
  LeadCampanha,
  MetaIndicacaoCampanha,
  ModoDuracao,
  ModoPublico,
  MotivoSaidaLeadCampanha,
  OperadorCriterio,
  ProdutoResumo,
  ResumoLead,
  StatusCampanha,
  SupabaseBruto,
  TipoCampanha,
  TipoComissao,
  ToastApi,
  VariacaoAB,
} from "./tipos";

// Helpers e constantes
export {
  badgeEstado,
  badgeStatus,
  badgeTipo,
  botaoPrimarioStyle,
  botaoSecundarioStyle,
  calcularKpi,
  COLUNAS_DETALHE,
  COLUNAS_LEAD_CAMPANHA,
  COLUNAS_LISTAGEM,
  inputStyle,
  nomeLead,
  pegarToast,
  proximoStatusCampanha,
} from "./tipos";

// Componentes de UI compartilhados
export {
  BadgeEstado,
  BadgeStatus,
  BadgeTipo,
  BotaoIcone,
  BotaoStatus,
  Campo,
  CardKpi,
  FiltroPilulas,
  Linha,
  PontoFase,
  Vazio,
} from "./ui-campanha";
