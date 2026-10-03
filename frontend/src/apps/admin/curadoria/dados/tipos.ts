/**
 * Tipos compartilhados do app Curadoria (admin fullscreen).
 *
 * Referencia 1:1 as tabelas do Supabase (banco vivo Onda 1):
 *   - cargos
 *   - avisos_curadoria
 *   - modelos_llm + provedores_llm
 *   - blocos_* (14 gavetas)
 *   - config_chamadas_llm (Onda C1 — placeholder até existir)
 *   - perfil_empresa (Onda B3 — placeholder)
 *   - comparativo_nicho (Onda B5 — placeholder)
 *   - candidatos_bloco
 *   - leads (com desfecho B1)
 */

// ============================================================
// Escopos + status (vocabulário oficial)
// ============================================================

export type EscopoCuradoria = "global" | "nicho" | "tenant" | "produto";
export type StatusEmbedding = "pendente" | "pronto" | "falhou";
export type PosicaoChamadaLlm = "turno" | "cron";
export type DesfechoLead = "em_aberto" | "convertido" | "perdido" | "sumiu";
export type SeveridadeAviso = "info" | "atencao" | "critico" | "sugestao";
export type AmbienteTenant = "prod" | "staging" | "universo";

// ============================================================
// Aviso (tabela avisos_curadoria — Onda 1)
// ============================================================

export interface AvisoCuradoria {
  id: string;
  autor_tipo: "cargo" | "humano";
  cargo_id: string | null;
  criado_por: string | null;
  severidade: SeveridadeAviso;
  titulo: string;
  mensagem: string;
  contexto_aba: string | null;
  bloco_origem_tabela: string | null;
  bloco_origem_id: string | null;
  acao_sugerida_tipo: string | null;
  acao_sugerida_payload: Record<string, unknown> | null;
  escopo: "global" | "nicho" | "tenant";
  nicho_id: string | null;
  tenant_id: string | null;
  embedding_status: StatusEmbedding;
  lido_em: string | null;
  lido_por: string | null;
  arquivado_em: string | null;
  arquivado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

// ============================================================
// Tenant (impersonação)
// ============================================================

export interface TenantImpersonado {
  id: string;
  nome: string;
  nicho: string | null;
  nicho_id: string | null;
  leads: number;
  ambiente: AmbienteTenant;
  avatar_cor?: string;
}

export const TENANT_UNIVERSO: TenantImpersonado = {
  id: "00000000-0000-0000-0000-000000000000",
  nome: "Universo (global)",
  nicho: null,
  nicho_id: null,
  leads: 0,
  ambiente: "universo",
  avatar_cor: "oklch(0.74 0.16 150)",
};

// ============================================================
// Cargo (subset usado pelo seletor LLM + chat)
// ============================================================

export interface CargoResumido {
  id: string;
  nome: string;
  tipologia: "atendimento" | "mentor" | "face_cliente" | "admin";
  escopo: "global" | "nicho" | "tenant";
  canal_atuacao: "interno" | "externo" | "ambos";
  modelo_llm_padrao: string | null;
}

// ============================================================
// Modelo LLM (tabela modelos_llm)
// ============================================================

export interface ModeloLlm {
  id: string;
  provider_id: string;
  provider_slug?: string;
  nome: string;
  slug: string;
  custo_input_1m: number;
  custo_output_1m: number;
  context_window: number;
  is_active: boolean;
  is_default: boolean;
}

// ============================================================
// Configuração de chamada LLM (futuro C1 — placeholder até migration)
// ============================================================

export interface ConfigChamadaLlm {
  id: string;
  chave: string;
  modelo: string;
  prompt_template: string;
  itens_produzidos: string[];
  posicao: PosicaoChamadaLlm;
  schedule: string | null;
  temperatura: number;
  max_tokens: number;
  json_mode: boolean;
  ativo: boolean;
  custo_teto_diario: number | null;
  escopo: "global" | "nicho" | "tenant";
  nicho_id: string | null;
  tenant_id: string | null;
  versao: number;
  notas: string | null;
  gavetas_ativas?: Record<string, GavetaAtiva>;
}

export interface GavetaAtiva {
  ativo: boolean;
  piso: number;
  top_n: number;
  rerank: boolean;
}

// ============================================================
// Bloco (família 14 gavetas — base comum)
// ============================================================

export interface BlocoBase {
  id: string;
  conteudo: string;
  category?: string | null;
  escopo: EscopoCuradoria;
  nicho_id?: string | null;
  tenant_id?: string | null;
  produto_id?: string | null;
  embedding_status: StatusEmbedding;
  ativo: boolean;
  tags?: string[];
  metadados?: Record<string, unknown>;
  criado_em: string;
  atualizado_em: string;
}

export type GavetaBloco =
  | "blocos_conhecimento"
  | "blocos_comportamento"
  | "diretriz_bolha_blocos"
  | "blocos_meta"
  | "blocos_gatilho"
  | "regras_operacionais_blocos"
  | "blocos_procedurais"
  | "blocos_humanizacao"
  | "blocos_variacao"
  | "anti_padroes"
  | "emocao_blocos"
  | "prova_social_blocos"
  | "manipulacao_blocos"
  | "acao_pausa_blocos";

// ============================================================
// Cron / Sono (C2)
// ============================================================

export interface JobCron {
  chave: string;
  schedule: string;
  categoria: "cognitivo" | "operacional" | "monitoramento";
  ativo: boolean;
  edge_function: string;
  ultima_exec?: string | null;
  status_ultima?: "sucesso" | "falha" | null;
  falhas_30d: number;
  duracao_media_ms: number;
}

// ============================================================
// Perfil empresa + Cross-nicho (B3/B4/B5/B6)
// ============================================================

export interface PerfilEmpresa {
  id: string;
  tenant_id: string;
  padroes_conversao: Record<string, string>;
  objecoes_frequentes: Array<{ texto: string; freq: number }>;
  timing_otimo: Record<string, unknown>;
  perfil_lead_ideal: Record<string, unknown>;
  sequencias_que_convertem: Array<{
    acao: string;
    efeito_pct: number;
    intervalo_confianca: [number, number];
    n: number;
  }>;
  origem_por_campo?: Record<string, "prior_nicho" | "dado_proprio" | "misto">;
  ultimo_destilado_em?: string | null;
  versao: number;
}

export interface CandidatoBloco {
  id: string;
  tabela_origem: string;
  bloco_origem_id: string;
  conteudo_proposto: string;
  escopo_alvo: "nicho" | "global";
  nicho_id?: string | null;
  n_tenants_aprovaram?: number;
  status: "pendente" | "aprovado" | "recusado";
  decidido_por?: string | null;
  decidido_em?: string | null;
  criado_em: string;
}

// ============================================================
// Abas
// ============================================================

export interface DefAba {
  id: AbaId;
  label: string;
  icone: NomeIcone;
  componente: string;
  atalho?: string;
  badge?: string;
  destaque?: boolean;
  secao: "avisos" | "operacao" | "control_plane";
}

export type AbaId =
  | "avisos"
  | "cerebro"
  | "dashboard"
  | "conversa"
  | "blocos"
  | "pacotes"
  | "simulador"
  | "empatia"
  | "produtos"
  | "tools"
  | "gatilhos"
  | "acompanhamentos"
  | "cargos"
  | "chamadas"
  | "crons"
  | "cross_nicho"
  | "recursos";

export type NomeIcone =
  | "Brain"
  | "Bell"
  | "Activity"
  | "Chart"
  | "Chat"
  | "Book"
  | "Flask"
  | "Heart"
  | "Cart"
  | "Wrench"
  | "Zap"
  | "Cal"
  | "Badge"
  | "Cpu"
  | "Clock"
  | "Layers"
  | "Search"
  | "Cmd"
  | "X"
  | "Plus"
  | "Chev"
  | "ChevR"
  | "Play"
  | "Save"
  | "Trash"
  | "Edit"
  | "Refresh"
  | "Alert"
  | "Check"
  | "Sun"
  | "Logout"
  | "Eye"
  | "Power"
  | "Filter"
  | "Target"
  | "Users"
  | "Smile"
  | "Shuffle"
  | "Ban"
  | "Shield"
  | "Wand"
  | "Pause"
  | "Msg"
  | "Lists"
  | "Send"
  | "Dot"
  | "Sparkles"
  | "Drop"
  | "Folder"
  | "Database"
  | "History"
  | "Copy"
  | "Code"
  | "Globe"
  | "Building"
  | "Paperclip"
  | "Mic"
  | "Image"
  | "Minimize"
  | "Maximize"
  | "Volume";

// ============================================================
// Chat lateral
// ============================================================

export type TipoMidiaCuradoria = "imagem" | "audio" | "video" | "documento";

export interface MidiaPendenteCuradoria {
  arquivo?: File;
  blob?: Blob;
  tipo: TipoMidiaCuradoria;
  nome?: string;
  duracao_segundos?: number;
  mime?: string;
}

export interface MensagemChatCuradoria {
  id: string;
  papel: "humano" | "agente" | "sistema";
  conteudo: string;
  midia_url?: string | null;
  midia_tipo?: TipoMidiaCuradoria | null;
  modelo_usado?: string | null;
  criado_em: string;
}
