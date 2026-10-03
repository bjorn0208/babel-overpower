// Tipos para o inventário de peças do ragentic-lab
// Usado pelo painel "Ragentic-Lab (gap)" — Fase C3 do Mapa do Motor Vivo

/** Maturidade da peça no lab conforme inventário */
export type MaturidadeLab = "implementada" | "parcial" | "doc-only" | "INCERTO";

/** Cobertura cruzada com o motor de hoje (heurística por nome/conceito) */
export type CoberturaMotor = "tem" | "parcial" | "falta" | "?";

/** Seção/categoria da peça no inventário */
export type SecaoLab =
  | "infra-turno"
  | "porteiro-s1"
  | "recall-rag"
  | "workspace"
  | "bdi-tom"
  | "estado-afetivo"
  | "sintese-s2"
  | "anti-redundancia"
  | "tools-react"
  | "memoria-lp"
  | "consciencia"
  | "cargos-identidade"
  | "cronjobs"
  | "infra-conhecimento"
  | "interface-workbench";

/** Uma peça do inventário ragentic-lab */
export interface PecaLab {
  /** Identificador único (slug kebab) */
  id: string;
  /** Nome da peça (legível) */
  nome: string;
  /** O que a peça faz */
  o_que_faz: string;
  /** Onde vive no lab (arquivo/função/tabela) */
  onde_no_lab: string;
  /** Maturidade no lab */
  maturidade: MaturidadeLab;
  /** Seção/categoria */
  secao: SecaoLab;
  /**
   * Cobertura no motor de hoje — cruzamento heurístico por nome/conceito
   * vs label/id/faz dos 42 nós do grafo.
   * CRITÉRIO: comparação de termos-chave entre nome/o_que_faz da peça e
   * label/faz dos nós do grafo. NÃO é automação perfeita — guia visual.
   * Confirme manualmente antes de agir.
   */
  cobertura: CoberturaMotor;
  /**
   * IDs dos nós do grafo que correspondem (parcial ou total).
   * Vazio se cobertura = "falta" ou "?".
   */
  nos_correspondentes: string[];
}
