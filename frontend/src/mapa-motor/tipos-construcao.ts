// Tipos da visão "Construção da Mensagem" (modo cérebro)
// Fonte: tabela public.prompts_turno (gravada pelo motor ragentic v57+)

import type { MensagemReal } from "./tipos-replay";

/** Chaves dos blocos rotulados gravados em prompts_turno.blocos */
export type ChaveBloco =
  | "temporal"
  | "identidade"
  | "bussola"
  | "diretrizes"
  | "empatia"
  | "crenca"
  | "fatos"
  | "episodios"
  | "pensamento"
  | "ema"
  | "rag";

/** blocos jsonb: cada chave guarda o texto literal daquele pedaço do prompt */
export interface BlocosPrompt {
  temporal?: string;
  identidade?: string;
  bussola?: string;
  diretrizes?: string;
  empatia?: string;
  crenca?: string;
  fatos?: string;
  episodios?: string;
  pensamento?: string;
  ema?: string;
  rag?: string;
  proativo?: boolean;
}

/** Uma linha de prompts_turno = o System Prompt literal de um turno */
export interface PromptTurno {
  id: string;
  conversa_id: string;
  agente_id: string | null;
  lead_id: string | null;
  modelo_llm: string | null;
  prompt_completo: string;
  blocos: BlocosPrompt | null;
  criado_em: string;
}

/** Uma região do "cérebro" — cluster de blocos que acende junto */
export interface RegiaoCerebro {
  id: string;
  titulo: string;
  resumo: string;
  /** blocos que compõem a região, na ordem real de montagem do prompt */
  chaves: ChaveBloco[];
  /** matiz OKLCH (hue) da região — usado em cor sólida e glow */
  hue: number;
  /** região final = mostra o prompt_completo inteiro (resultado), não blocos soltos */
  ehFinal?: boolean;
}

/** Estado da navegação passo-a-passo da construção */
export interface EstadoConstrucao {
  turnos: PromptTurno[];
  /** mensagens role='user' da conversa (o que o lead enviou) — ordem cronológica */
  mensagens: MensagemReal[];
  turnoIdx: number; // qual turno da conversa (0-based); -1 = nenhum
  passoIdx: number; // qual região está acesa (-1 = nada aceso ainda)
  carregando: boolean;
  erro: string | null;
}
