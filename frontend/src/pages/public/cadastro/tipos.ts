/**
 * Tipos locais da página pública de auto-cadastro por indicação.
 * /cadastro?ref=CODE
 */

export type ImplantacaoItem = {
  id: string;
  nome: string;
  preco: number;
};

export type ConfigPlataforma = {
  pix_key: string | null;
  termos_uso: string | null;
  termos_uso_ativo: boolean | null;
};

export type CamposForm = {
  nome: string;
  cpf: string;
  whatsapp: string;
  email: string;
  senha: string;
};
