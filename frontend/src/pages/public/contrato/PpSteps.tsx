/**
 * PpSteps — re-exports de todos os steps da jornada pública.
 * Arquivo mantido como ponto único de importação para o orquestrador.
 * Cada step vive em arquivo próprio (≤300 linhas cada).
 */

export { StepDados, StepContrato } from "./PpStepsDados";
export { StepPagamento, StepComprovante } from "./PpStepsPagamento";
export { StepSelfie, StepDocumento } from "./PpStepsMidia";
export { StepAssinatura } from "./StepAssinatura";
export { StepTestemunha, StepConcluido } from "./PpStepsFinais";
export { PpUpload, PpAcoes } from "./PpShared";
