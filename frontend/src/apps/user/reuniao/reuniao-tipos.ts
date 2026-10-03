/**
 * Tipos compartilhados do app Reunião.
 */

export type SalaResumo = {
  id: string;
  titulo: string;
  status: string;
  chave_publica: string;
  agendada_para: string | null;
  duracao_min: number | null;
};

export type MembroEquipe = {
  id: string;
  nome: string;
};

export type SessaoChamada = {
  salaId: string;
  chavePublica: string;
  titulo: string;
  ehAnfitriao: boolean;
  participanteId?: string;
};
