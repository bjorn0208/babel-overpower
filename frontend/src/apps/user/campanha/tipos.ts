/**
 * Tipos, constantes e helpers compartilhados do app Campanha.
 *
 * Espelha o schema vivo do banco (sem inventar coluna): `campanhas`,
 * `fases_campanha`, `leads_campanha`, `meta_indicacao_campanha`.
 *
 * Padrão visual e estrutural cravado pelo app Contratos
 * (`apps/user/contratos/tipos.ts`) — Campo, Vazio, CardKpi, inputStyle.
 */

import type React from "react";

// ---------------------------------------------------------------------------
// Enums do banco (CHECK constraints reais)
// ---------------------------------------------------------------------------

export type TipoCampanha =
  | "divulgacao"
  | "venda"
  | "pos_venda"
  | "cobranca"
  | "agendamento"
  | "indicacao";

export type StatusCampanha = "rascunho" | "ativa" | "pausada" | "finalizada";

export type ModoDuracao = "prazo" | "periodica" | "vitalicia";

export type EstadoLeadCampanha = "ativo" | "fechado" | "desistente";

export type MotivoSaidaLeadCampanha =
  | "silencio"
  | "frase_negativa"
  | "recusa"
  | "opt_out"
  | "manual"
  | "convertido"
  | "campanha_deletada";

export type VariacaoAB = "a" | "b";

export type TipoComissao = "fixo" | "percentual";

// ---------------------------------------------------------------------------
// Filtros canônicos (formato vivo no JSONB `campanhas.filters`)
// ---------------------------------------------------------------------------

export type OperadorCriterio =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "contains_any"
  | "contains_all"
  | "is_null"
  | "is_not_null";

export interface CriterioFiltro {
  chave: string;
  operador: OperadorCriterio;
  valor?: string | number;
  valor_min?: number;
  valor_max?: number;
  valores?: string[];
}

export type ModoPublico = "segmento" | "lead_ids" | "persona" | "todos";

export interface FiltrosCampanha {
  modo: ModoPublico;
  operador_global: "AND" | "OR";
  criterios: CriterioFiltro[];
  lead_ids?: string[];
  persona?: {
    descricao: string;
    vetor_semantico?: number[] | null;
  };
}

// ---------------------------------------------------------------------------
// Entidades de dados (espelha tabelas)
// ---------------------------------------------------------------------------

export interface Campanha {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  type: TipoCampanha;
  objective: string;
  product_id: string | null;
  status: StatusCampanha;
  filters: FiltrosCampanha | Record<string, unknown>;
  duration_mode: ModoDuracao;
  starts_at: string;
  ends_at: string | null;
  recurrence: Record<string, unknown> | null;
  throttle_per_day: number | null;
  throttle_per_hour: number | null;
  window_start: string;
  window_end: string;
  weekdays: number[];
  skip_holidays: boolean;
  desistance_silence_days: number;
  desistance_phrases: string[];
  response_actions: string[];
  attempt_thresholds: Record<string, unknown> | null;
  pos_venda_dias_apos_compra: number | null;
  ab_test_config: Record<string, unknown> | null;
  /** Δ 2026-09-17: mensagem personalizada do 1º contato (null = a agente escreve). */
  mensagem_inicial: string | null;
  midia_url: string | null;
  tipo_conteudo: "texto" | "foto" | "foto_texto" | "video";
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FaseCampanha {
  id: string;
  campaign_id: string;
  slug: string;
  order_index: number;
  description: string;
  instruction: string;
  regra: string;
  is_final_positive: boolean;
  label: string;
  slots_obrigatorios: string[];
  created_at: string;
}

export interface LeadCampanha {
  id: string;
  campaign_id: string;
  lead_id: string;
  phase: string;
  state: EstadoLeadCampanha;
  attempt_count: number;
  entered_at: string;
  last_contact_at: string | null;
  closed_at: string | null;
  exit_reason: MotivoSaidaLeadCampanha | null;
  reproposta_count: number;
  archived_at: string | null;
  ab_variacao: VariacaoAB | null;
  /** Resumo do lead vindo via FK alias `lead:leads(...)` */
  lead?: ResumoLead | null;
}

export interface ResumoLead {
  id: string;
  name: string | null;
  nome_exibicao: string | null;
  phone: string | null;
  url_foto_perfil: string | null;
  pontuacao?: number | null;
  temperatura_lead?: string | null;
}

export interface MetaIndicacaoCampanha {
  campaign_id: string;
  tenant_id: string;
  cupom: string;
  chave_publica: string;
  indicador_nome: string;
  indicador_email: string | null;
  indicador_telefone: string | null;
  indicador_foto_url: string | null;
  comissao_tipo: TipoComissao;
  comissao_valor: number;
  pagamento_valor: number | null;
  pagamento_data: string | null;
  pagamento_metodo: string | null;
  comprovante_url: string | null;
  observacao: string | null;
  concluida_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProdutoResumo {
  id: string;
  nome: string;
}

/** KPIs derivados de `leads_campanha` por campanha (calculado no client). */
export interface KpiCampanha {
  total: number;
  ativos: number;
  fechados: number;
  desistentes: number;
  taxa_conversao: number;
  ultimo_contato: string | null;
}

// ---------------------------------------------------------------------------
// Abas + filtros de UI
// ---------------------------------------------------------------------------

export type AbaCampanha = "lista" | "wizard";
export type AbaVisao = "operacao" | "fechados" | "desistentes" | "config";
export type FiltroStatus =
  | "todas"
  | "rascunho"
  | "ativa"
  | "pausada"
  | "finalizada";
export type FiltroTipo = "todos" | TipoCampanha;

// ---------------------------------------------------------------------------
// Toast helper (resolve em runtime — mesmo padrão do app Contratos)
// ---------------------------------------------------------------------------

export interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
}

/**
 * Δ 2026-09-14: próximo status do botão Pausar/Ativar — um só lugar pra lista e
 * pra visão. Finalizada também reativa (antes sumia qualquer botão: o motor
 * finaliza quando passa do `ends_at`, e mudar a data depois não trazia a
 * campanha de volta). Com `ends_at` já vencido, ativar é inútil — o próximo
 * ciclo finalizaria de novo — então devolve o motivo em vez do status.
 */
export function proximoStatusCampanha(
  c: Pick<Campanha, "status" | "ends_at">,
): { novo: StatusCampanha; bloqueio: string | null } {
  if (c.status === "ativa") return { novo: "pausada", bloqueio: null };
  if (c.ends_at && new Date(c.ends_at).getTime() <= Date.now()) {
    const quando = new Date(c.ends_at).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      novo: "ativa",
      bloqueio: `Esta campanha terminou em ${quando}. Ajuste "Termina em" na Configuração antes de ativar.`,
    };
  }
  return { novo: "ativa", bloqueio: null };
}

export function pegarToast(): ToastApi {
  const w = window as unknown as { useToast?: () => ToastApi };
  return w.useToast?.() ?? { success: () => {}, error: () => {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseBruto = any;

// ---------------------------------------------------------------------------
// Helpers de badge / rotulagem
// ---------------------------------------------------------------------------

/** Cores em OKLCH coerentes com o resto da plataforma (azul/lilás/verde/laranja/vermelho). */
export function badgeStatus(s: StatusCampanha): {
  rotulo: string;
  cor: string;
  fundo: string;
} {
  if (s === "ativa") {
    return {
      rotulo: "Ativa",
      cor: "oklch(0.72 0.18 145)",
      fundo: "oklch(0.72 0.18 145 / 0.15)",
    };
  }
  if (s === "pausada") {
    return {
      rotulo: "Pausada",
      cor: "oklch(0.78 0.18 80)",
      fundo: "oklch(0.78 0.18 80 / 0.15)",
    };
  }
  if (s === "finalizada") {
    return {
      rotulo: "Finalizada",
      cor: "oklch(0.98 0 0 / 0.55)",
      fundo: "oklch(0.98 0 0 / 0.05)",
    };
  }
  return {
    rotulo: "Rascunho",
    cor: "oklch(0.7 0.18 220)",
    fundo: "oklch(0.7 0.18 220 / 0.15)",
  };
}

export function badgeTipo(t: TipoCampanha): { rotulo: string; cor: string } {
  const mapa: Record<TipoCampanha, { rotulo: string; cor: string }> = {
    divulgacao: { rotulo: "Divulgação", cor: "oklch(0.65 0.22 280)" },
    venda: { rotulo: "Venda", cor: "oklch(0.72 0.18 145)" },
    pos_venda: { rotulo: "Pós-venda", cor: "oklch(0.7 0.18 220)" },
    cobranca: { rotulo: "Cobrança", cor: "oklch(0.65 0.24 25)" },
    agendamento: { rotulo: "Agendamento", cor: "oklch(0.78 0.18 80)" },
    indicacao: { rotulo: "Indicação", cor: "oklch(0.7 0.16 320)" },
  };
  return mapa[t];
}

export function badgeEstado(e: EstadoLeadCampanha): {
  rotulo: string;
  cor: string;
  fundo: string;
} {
  if (e === "ativo") {
    return {
      rotulo: "Ativo",
      cor: "oklch(0.72 0.18 145)",
      fundo: "oklch(0.72 0.18 145 / 0.15)",
    };
  }
  if (e === "fechado") {
    return {
      rotulo: "Fechado",
      cor: "oklch(0.7 0.18 220)",
      fundo: "oklch(0.7 0.18 220 / 0.15)",
    };
  }
  return {
    rotulo: "Desistente",
    cor: "oklch(0.65 0.24 25)",
    fundo: "oklch(0.65 0.24 25 / 0.15)",
  };
}

/** Nome humano de um LeadCampanha — cai em fallbacks até achar algo. */
export function nomeLead(l: LeadCampanha): string {
  const r = l.lead;
  if (!r) return l.lead_id.slice(0, 8);
  return r.nome_exibicao || r.name || r.phone || l.lead_id.slice(0, 8);
}

/**
 * KPI de uma campanha calculado a partir do array de leads_campanha
 * já carregado. Mantém a contagem em memória pra evitar round-trip
 * extra ao banco numa tela com muitas campanhas listadas.
 */
export function calcularKpi(leads: LeadCampanha[]): KpiCampanha {
  let ativos = 0;
  let fechados = 0;
  let desistentes = 0;
  let ultimo: string | null = null;
  for (const l of leads) {
    if (l.state === "ativo") ativos += 1;
    else if (l.state === "fechado") fechados += 1;
    else desistentes += 1;
    if (l.last_contact_at && (!ultimo || l.last_contact_at > ultimo)) {
      ultimo = l.last_contact_at;
    }
  }
  const total = ativos + fechados + desistentes;
  const taxa = total > 0 ? Math.round((fechados / total) * 1000) / 10 : 0;
  return {
    total,
    ativos,
    fechados,
    desistentes,
    taxa_conversao: taxa,
    ultimo_contato: ultimo,
  };
}

// ---------------------------------------------------------------------------
// Constantes de query
// ---------------------------------------------------------------------------

/**
 * Colunas mínimas pra listagem de campanhas (vem em chunk grande de campanhas).
 * Não traz `attempt_thresholds`, `ab_test_config`, `recurrence` — só lazy load
 * quando entrar na Visão.
 */
export const COLUNAS_LISTAGEM =
  "id, tenant_id, name, description, type, objective, product_id, status, " +
  "filters, duration_mode, starts_at, ends_at, throttle_per_day, " +
  "throttle_per_hour, window_start, window_end, weekdays, skip_holidays, " +
  "desistance_silence_days, pos_venda_dias_apos_compra, " +
  "mensagem_inicial, midia_url, tipo_conteudo, created_at, updated_at";

/**
 * Colunas completas pra Visão de uma campanha — inclui jsonb pesados.
 */
export const COLUNAS_DETALHE = COLUNAS_LISTAGEM + ", recurrence, attempt_thresholds, ab_test_config";

/** Resumo de lead embedado nos leads_campanha (FK alias). */
export const COLUNAS_LEAD_CAMPANHA =
  "id, campaign_id, lead_id, phase, state, attempt_count, entered_at, " +
  "last_contact_at, closed_at, exit_reason, reproposta_count, ab_variacao, " +
  "archived_at, " +
  "lead:leads(id, name, nome_exibicao, phone, url_foto_perfil, pontuacao, temperatura_lead)";

// ---------------------------------------------------------------------------
// Estilo base de input (mesmo design glass dark do app Contratos)
// ---------------------------------------------------------------------------

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 12,
  background: "oklch(0.18 0.06 280 / 0.4)",
  color: "oklch(0.98 0 0)",
  border: "1px solid oklch(0.98 0 0 / 0.1)",
  borderRadius: 10,
  outline: "none",
};

export const botaoPrimarioStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 600,
  background:
    "linear-gradient(135deg, oklch(0.7 0.18 220 / 0.4), oklch(0.65 0.22 280 / 0.3))",
  color: "oklch(0.98 0 0)",
  border: "1px solid oklch(0.7 0.18 220 / 0.5)",
  borderRadius: 10,
  cursor: "pointer",
};

export const botaoSecundarioStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 500,
  background: "oklch(0.98 0 0 / 0.05)",
  color: "oklch(0.98 0 0 / 0.7)",
  border: "1px solid oklch(0.98 0 0 / 0.1)",
  borderRadius: 10,
  cursor: "pointer",
};
