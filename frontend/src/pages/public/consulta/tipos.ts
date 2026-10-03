/**
 * Tipos da página pública de consulta de crédito/débito.
 */

export interface CampoFormulario {
  slug: string;
  rotulo: string;
  tipo: "text" | "tel" | "email" | "numero";
  obrigatorio: boolean;
  ativo: boolean;
}

export interface DadosConsultaPublica {
  chave_publica: string;
  titulo: string | null;
  nome_empresa: string | null;
  logo_url: string | null;
  banner_url: string | null;
  cor_pagina: string | null;
  aviso_final: string | null;
  tipo_doc: "cpf" | "cnpj" | null;
  preco: number | null;
  // Link universal: preço por tipo de documento (o front escolhe pelo doc digitado).
  preco_venda_cpf: number | null;
  preco_venda_cnpj: number | null;
  chave_pix: string | null;
  campos_obrigatorios: string[];
  campos_formulario: CampoFormulario[] | null;
  instrucao_selfie: string | null;
  status:
    | "rascunho"
    | "aguardando_pagamento"
    | "comprovante_enviado"
    | "validando"
    | "fila_revisao"
    | "consultando"
    | "concluida"
    | "erro"
    | "recusada";
  resultado: Record<string, unknown> | null;
  pdf_url: string | null;
}

export type IdStepConsulta =
  | "dados"
  | "selfie"
  | "documento"
  | "comprovante"
  | "aguardando"
  | "resultado";

export interface MetaStep {
  id: IdStepConsulta;
  titulo: string;
}
