/**
 * Dados de demonstração do app RH — fase visual pra apresentação de vendas.
 * Quando o RH for ligado no banco, este arquivo dá lugar às queries
 * (equipe real do tenant + currículos recebidos pelo formulário público).
 */

export type Funcionario = {
  id: string;
  nome: string;
  cargo: string;
  regime: "CLT" | "PJ" | "Estágio";
  admissao: string;
  salario: string;
  status: "ativo" | "ferias" | "experiencia";
  aniversario: string;
};

export type Curriculo = {
  id: string;
  nome: string;
  vaga: string;
  cidade: string;
  pretensao: string;
  aderencia: number;
  status: "novo" | "entrevista" | "finalista" | "arquivado";
  recebidoEm: string;
};

export const FUNCIONARIOS_DEMO: Funcionario[] = [
  { id: "f1", nome: "Ana Beatriz Rocha", cargo: "Atendimento comercial", regime: "CLT", admissao: "03/02/2025", salario: "R$ 2.900,00", status: "ativo", aniversario: "12/08" },
  { id: "f2", nome: "Carlos Eduardo Lima", cargo: "Técnico de campo", regime: "CLT", admissao: "18/09/2024", salario: "R$ 3.400,00", status: "ferias", aniversario: "04/11" },
  { id: "f3", nome: "Juliana Prado", cargo: "Financeiro e cobrança", regime: "PJ", admissao: "07/01/2026", salario: "R$ 4.100,00", status: "ativo", aniversario: "27/03" },
  { id: "f4", nome: "Rafael Nogueira", cargo: "Auxiliar administrativo", regime: "Estágio", admissao: "12/05/2026", salario: "R$ 1.320,00", status: "experiencia", aniversario: "19/09" },
];

export const CURRICULOS_DEMO: Curriculo[] = [
  { id: "c1", nome: "Marina Duarte", vaga: "Atendimento comercial", cidade: "Curitiba/PR", pretensao: "R$ 3.100,00", aderencia: 92, status: "finalista", recebidoEm: "30/07" },
  { id: "c2", nome: "Pedro Henrique Souza", vaga: "Técnico de campo", cidade: "São José dos Pinhais/PR", pretensao: "R$ 3.600,00", aderencia: 84, status: "entrevista", recebidoEm: "29/07" },
  { id: "c3", nome: "Larissa Campos", vaga: "Atendimento comercial", cidade: "Curitiba/PR", pretensao: "R$ 2.800,00", aderencia: 77, status: "novo", recebidoEm: "01/08" },
  { id: "c4", nome: "Gustavo Ferraz", vaga: "Auxiliar administrativo", cidade: "Colombo/PR", pretensao: "R$ 1.900,00", aderencia: 63, status: "novo", recebidoEm: "01/08" },
  { id: "c5", nome: "Renata Albuquerque", vaga: "Técnico de campo", cidade: "Pinhais/PR", pretensao: "R$ 3.900,00", aderencia: 41, status: "arquivado", recebidoEm: "22/07" },
];
