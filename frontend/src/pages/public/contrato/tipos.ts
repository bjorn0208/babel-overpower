/**
 * Tipos TypeScript para a página pública de contrato v2.
 * Corresponde exatamente às 28 colunas retornadas por obter_contrato_por_token.
 */

/** Produto retornado em dados_pagamento.por_produto */
export interface ItemPagamento {
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

/** Opção de parcelamento calculada pelo Postgres (calcular_plano_pagamento — F2) */
export interface OpcaoPlano {
  parcelas: number;
  valor_parcela_centavos: number;
  primeira_parcela_centavos: number;
  entrada_centavos: number;
  total_centavos: number;
  origem_parcela?: "cravada" | "calculada";
}

/** Opção nomeada do produto (produtos.opcoes_pagamento), cada uma com total próprio */
export interface OpcaoNomeada {
  id: string;
  rotulo: string;
  total_centavos: number;
  entrada_centavos: number;
  parcelas: number;
  valor_parcela_centavos: number;
  observacao?: string | null;
}

/** Plano de pagamento de um conjunto de itens (snapshot — zero conta no client) */
export interface PlanoPagamento {
  /** v6: quando presente, a página oferece estas opções no lugar de à vista × parcelado */
  opcoes_nomeadas?: OpcaoNomeada[] | null;
  total_centavos: number;
  entrada_centavos: number;
  max_parcelas: number;
  opcoes: OpcaoPlano[];
  por_produto?: Array<{ produto_id: string; nome: string | null; qtd: number; preco_centavos: number; subtotal_centavos: number }>;
  versao_funcao?: string;
}

/** Modos junto/separado (DEC-042): junto = 1 plano da soma; separado = 1 plano por produto */
export interface PlanosPagamento {
  junto: PlanoPagamento;
  separado: PlanoPagamento[];
}

/** Estrutura de dados_pagamento (jsonb, pode ser null em contratos pré-v2) */
export interface DadosPagamento {
  total_avista: number;
  max_parcelas: number;
  entrada?: number | null;
  valor_parcela?: number | null;
  parcelas?: number | null;
  pagamento?: Record<string, unknown>;
  por_produto?: ItemPagamento[];
  /** F2: planos pré-calculados no Postgres (contratos novos) */
  planos?: PlanosPagamento | null;
  fallback_molde?: boolean;
}

/** Escolha de pagamento coletada no step e enviada no payload */
export interface EscolhaPagamento {
  /** "opcao" = uma das opcoes_nomeadas do plano junto (ver opcao_id) */
  modo: "avista" | "parcelado" | "opcao";
  opcao_id?: string;
  parcelas: number | null;
  /** DEC-042 — multi-produto: pagar tudo junto ou cada produto separado */
  composicao?: "junto" | "separado";
  /** composicao=separado: escolha de parcelas por produto */
  por_produto?: Array<{ produto_id: string; modo: "avista" | "parcelado"; parcelas: number | null }>;
}

/** Placeholder de campo de cliente (retornado em placeholders[]) */
export interface PlaceholderCampo {
  /** Formato v2 (contratos_template.campos_cliente) */
  slug?: string;
  rotulo?: string;
  /** Formato legado tolerado */
  nome?: string;
  descricao?: string;
  tipo?: string;
  obrigatorio?: boolean;
}

/** Contrato retornado pela RPC obter_contrato_por_token (28 colunas) */
export interface DadosContrato {
  id: string;
  chave_publica: string;
  titulo: string | null;
  texto_contrato: string | null;
  logo_url: string | null;
  descricao_empresa: string | null;
  nome_empresa: string | null;
  cor_pagina: string | null;
  dados_cliente: Record<string, string> | null;
  status: string;
  assinado_em: string | null;
  campos_obrigatorios: string[] | null;
  instrucao_selfie: string | null;
  num_testemunhas: number;
  campos_cliente: string[] | null;
  opcoes_pagamento: Record<string, unknown> | null;
  metodo_pagamento: string | null;
  posicao_pagamento: string | null;
  chave_pix: string | null;
  link_parcelamento: string | null;
  url_comprovante_pagamento: string | null;
  pdf_url: string | null;
  conversa_id: string | null;
  agente_id: string | null;
  origem: string | null;
  placeholders: PlaceholderCampo[] | null;
  dados_pagamento: DadosPagamento | null;
  forma_pagamento_escolhida: EscolhaPagamento | null;
}

/** Identificador de step ativo */
export type IdStep =
  | "dados"
  | "contrato"
  | "pagamento"
  | "comprovante"
  | "selfie"
  | "documento"
  | "assinatura"
  | "testemunha"
  | "concluido";

/** Metadados de um step na barra de progresso */
export interface MetaStep {
  id: IdStep;
  titulo: string;
}
