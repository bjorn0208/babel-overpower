// Tipos exclusivos do módulo de replay de conversa (C2)
// Separa responsabilidade dos tipos do grafo (tipos.ts)

export interface ConversaListagem {
  id: string;
  phone: string | null;
  channel: string | null;
  created_at: string | null;
  status: string | null;
  titulo: string | null;
}

// Registro real de trace lido do banco
export interface TraceReal {
  id: string;
  conversa_id: string | null;
  tipo: string;
  modelo_llm: string | null;
  decisao: unknown; // JSON — porteiro: {intencao,cargo_alvo,urgencia,resumo}; sintese: {cargo,bolhas,...}
  raciocinio_interno: string | null;
  prompt_resumo: string | null;
  latencia_ms: number | null;
  custo_tokens_in: number | null;
  custo_tokens_out: number | null;
  criado_em: string;
  turno_id: string | null;
}

// Registro de mensagem (user ou assistant)
export interface MensagemReal {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string | null;
  carga: unknown; // JSON adicional
}

// Registro de bolha na caixa de saída
export interface BolhaSaidaReal {
  id: string;
  conversation_id: string;
  content: string;
  status: string;
  bubble_order: number;
  created_at: string;
  scheduled_at: string;
}

// Um passo da timeline de replay — pode ser trace, mensagem ou bolha
export type TipoPasso = "trace" | "mensagem" | "bolha_saida";

export interface PassoReplay {
  id: string;           // id original do registro
  tipo: TipoPasso;
  criado_em: string;    // ISO — usado para ordenação
  // Para mapear ao nó do grafo:
  nos_alvo: string[];   // lista de ids de nós do grafo que correspondem a este passo
  // Conteúdo bruto para exibição
  conteudo: ConteudoPasso;
}

export interface ConteudoPasso {
  // campos comuns
  titulo: string;
  // trace
  trace_tipo?: string;
  trace_decisao?: unknown;
  trace_modelo?: string | null;
  trace_latencia_ms?: number | null;
  trace_custo_in?: number | null;
  trace_custo_out?: number | null;
  trace_raciocinio?: string | null;
  trace_prompt_resumo?: string | null;
  // mensagem
  msg_role?: string;
  msg_content?: string;
  // bolha
  bolha_content?: string;
  bolha_status?: string;
  bolha_ordem?: number;
}

// Estado do motor de replay
export type EstadoPlay = "parado" | "rodando" | "pausado" | "fim";

export interface EstadoReplay {
  conversaId: string | null;
  passos: PassoReplay[];
  indiceAtual: number;       // -1 = antes do 1º passo
  estado: EstadoPlay;
  velocidade: number;        // multiplicador: 0.5 | 1 | 2 | "instantaneo" (99)
  carregando: boolean;
  erro: string | null;
}
