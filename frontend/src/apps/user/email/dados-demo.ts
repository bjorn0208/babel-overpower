/**
 * Dados de demonstração do app E-mail — fase visual pra apresentação de vendas.
 * Quando o e-mail próprio for ligado (domínio + caixa via provedor), este
 * arquivo dá lugar à sincronização real.
 */

export type Pasta = { id: string; nome: string; naoLidos: number };

export type Mensagem = {
  id: string;
  de: string;
  remetente: string;
  assunto: string;
  previa: string;
  corpo: string[];
  hora: string;
  naoLida: boolean;
  pasta: string;
};

export const PASTAS_DEMO: Pasta[] = [
  { id: "entrada", nome: "Caixa de entrada", naoLidos: 3 },
  { id: "enviados", nome: "Enviados", naoLidos: 0 },
  { id: "rascunhos", nome: "Rascunhos", naoLidos: 0 },
  { id: "arquivo", nome: "Arquivo", naoLidos: 0 },
];

export const MENSAGENS_DEMO: Mensagem[] = [
  {
    id: "m1",
    de: "marina.duarte@gmail.com",
    remetente: "Marina Duarte",
    assunto: "Orçamento aprovado — podemos fechar?",
    previa: "Boa tarde! Conversei com meu sócio e o orçamento que vocês mandaram foi aprovado…",
    corpo: [
      "Boa tarde!",
      "Conversei com meu sócio e o orçamento que vocês mandaram foi aprovado. Podemos fechar ainda essa semana?",
      "Se tiver como emitir o contrato hoje, já assino amanhã cedo.",
      "Obrigada!",
    ],
    hora: "09:42",
    naoLida: true,
    pasta: "entrada",
  },
  {
    id: "m2",
    de: "contador@escritoriocontabil.com.br",
    remetente: "Escritório Contábil",
    assunto: "Guia DAS de julho disponível",
    previa: "Segue em anexo a guia DAS da competência julho/2026, vencimento em 20/08…",
    corpo: [
      "Prezados,",
      "Segue em anexo a guia DAS da competência julho/2026, com vencimento em 20/08.",
      "Qualquer dúvida sobre o valor, estamos à disposição.",
    ],
    hora: "08:15",
    naoLida: true,
    pasta: "entrada",
  },
  {
    id: "m3",
    de: "noreply@banco.com.br",
    remetente: "Banco",
    assunto: "Comprovante de transferência recebida",
    previa: "Você recebeu uma transferência de R$ 2.400,00 na conta corrente…",
    corpo: [
      "Você recebeu uma transferência de R$ 2.400,00 na conta corrente.",
      "Data: 01/08/2026 · 17:03",
      "Origem: Marina Duarte",
    ],
    hora: "ontem",
    naoLida: true,
    pasta: "entrada",
  },
  {
    id: "m4",
    de: "pedro.souza@hotmail.com",
    remetente: "Pedro Henrique Souza",
    assunto: "Re: Entrevista técnica — quinta 14h",
    previa: "Confirmado! Estarei aí na quinta às 14h. Levo os certificados…",
    corpo: [
      "Confirmado! Estarei aí na quinta às 14h.",
      "Levo os certificados dos cursos técnicos que comentei na ligação.",
      "Até lá.",
    ],
    hora: "ontem",
    naoLida: false,
    pasta: "entrada",
  },
  {
    id: "m5",
    de: "voce@suaempresa.com.br",
    remetente: "Você",
    assunto: "Proposta comercial — manutenção mensal",
    previa: "Olá Marina, conforme conversamos, segue a proposta de manutenção mensal…",
    corpo: [
      "Olá Marina,",
      "Conforme conversamos, segue a proposta de manutenção mensal com os três planos.",
      "Fico à disposição pra ajustar o que precisar.",
    ],
    hora: "30/07",
    naoLida: false,
    pasta: "enviados",
  },
];
