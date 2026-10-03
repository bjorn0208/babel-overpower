/**
 * Dados de demonstração do app Crédito Bancário — fase visual.
 * A Babel captura a solicitação e corre os bancos; quando o fluxo real for
 * ligado (tabela + notificação pro time), este arquivo dá lugar às queries.
 */

export type EtapaCredito = "recebida" | "analise" | "propostas" | "liberado";

export type PropostaBanco = {
  banco: string;
  taxa: string;
  prazo: string;
  parcela: string;
  destaque?: boolean;
};

export type SolicitacaoCredito = {
  id: string;
  modalidade: string;
  valor: string;
  prazo: string;
  etapa: EtapaCredito;
  criadaEm: string;
  observacao?: string;
  propostas: PropostaBanco[];
};

export const ETAPAS: Array<{ id: EtapaCredito; rotulo: string }> = [
  { id: "recebida", rotulo: "Recebida pela Babel" },
  { id: "analise", rotulo: "Em análise" },
  { id: "propostas", rotulo: "Propostas dos bancos" },
  { id: "liberado", rotulo: "Crédito liberado" },
];

export const MODALIDADES = [
  "Capital de giro",
  "Antecipação de recebíveis",
  "Financiamento de equipamento",
  "Financiamento de veículo",
  "Crédito com garantia de imóvel",
  "Cartão BNDES",
];

export const SOLICITACOES_DEMO: SolicitacaoCredito[] = [
  {
    id: "s1",
    modalidade: "Capital de giro",
    valor: "R$ 80.000,00",
    prazo: "24 meses",
    etapa: "propostas",
    criadaEm: "28/07/2026",
    observacao: "Reforço de caixa pra compra de estoque do fim de ano.",
    propostas: [
      { banco: "Banco A", taxa: "1,49% a.m.", prazo: "24 meses", parcela: "R$ 3.980,00", destaque: true },
      { banco: "Banco B", taxa: "1,72% a.m.", prazo: "24 meses", parcela: "R$ 4.110,00" },
      { banco: "Cooperativa C", taxa: "1,55% a.m.", prazo: "18 meses", parcela: "R$ 5.140,00" },
    ],
  },
  {
    id: "s2",
    modalidade: "Financiamento de equipamento",
    valor: "R$ 42.000,00",
    prazo: "36 meses",
    etapa: "analise",
    criadaEm: "31/07/2026",
    observacao: "Máquina nova pra dobrar a produção.",
    propostas: [],
  },
];
