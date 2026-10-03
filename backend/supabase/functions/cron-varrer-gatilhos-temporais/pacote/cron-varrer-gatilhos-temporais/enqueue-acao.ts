/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Tipos mínimos usados pelo worker temporal

export interface ConversaAtiva {
  id: string;
  tenant_id: string;
  lead_id: string;
  updated_at: string; // proxy de silêncio
}

export interface TriggerTemporal {
  id: string;
  nome_trigger: string;
  tempo_aguardar_minutos: number;
  acao_disparada: string;
  // deno-lint-ignore no-explicit-any
  acao_payload: Record<string, any>;
  fase_aplicavel: string | null;
}

// ---------------------------------------------------------------------------
// Dedup — verifica se o trigger já foi disparado para essa conversa nas últimas
// `janelaHoras` horas, usando caixa_saida_mensagens.carga->>'trigger_id'.
// Retorna true se já existe registro recente (não disparar novamente).
// ---------------------------------------------------------------------------
export async function jaDisparouRecente(
  supabase: SupabaseClient,
  conversationId: string,
  triggerId: string,
  // Jitter (2026-08-29, chamado CM Soluções): janela fixa em 24h fazia o
  // 2º+ follow-up cair sempre no mesmo minuto do dia anterior — lead percebia
  // padrão robótico. Variação de ±4h (20h-28h) sorteada a cada chamada quebra
  // o horário cravado sem descolar da cadência de negócio (1h/6h/24h/3d).
  janelaHoras = 24 + (Math.random() * 8 - 4),
): Promise<boolean> {
  // Fix Bug #1 (2026-05-11): dedup checava caixa_saida_mensagens mas o cron
  // sweep grava em acoes_agendadas. Tabelas diferentes faziam o check nunca
  // bater — cron criava N planejar_retomada por gatilho. Agora checa a tabela
  // certa filtrando por carga->>trigger_id na janela das últimas N horas e
  // considerando qualquer status terminal não-cancelado (executado, pendente,
  // processando) como "já disparado".
  const corte = new Date(
    Date.now() - janelaHoras * 60 * 60_000,
  ).toISOString();

  const { data, error } = await supabase
    .from("acoes_agendadas")
    .select("id")
    .eq("conversation_id", conversationId)
    .in("status", ["pendente", "processando", "executado"])
    .gte("created_at", corte)
    .filter("carga->>trigger_id", "eq", triggerId)
    .limit(1);

  if (error) {
    console.warn(
      `[sweep-temporais] erro ao verificar dedup conv=${conversationId} trigger=${triggerId}:`,
      error.message,
    );
    // Conservativo: na dúvida, considera como já disparado pra não duplicar
    return true;
  }

  return Boolean(data && data.length > 0);
}

// ---------------------------------------------------------------------------
// Filtros do cronjob (DEC-017) — lê cronjobs_config.parametros.filtros.
// Cache em memória do módulo (TTL 60s) · cron roda a cada 5min, OK refresh.
// ---------------------------------------------------------------------------
type FiltrosCronjob = {
  nivel_engajamento_minimo: "frio" | "morno" | "quente";
  fases_aplicaveis: string[] | null;
  excluir_se: {
    /** Chave canônica pt-BR (após Big-Bang fase_pipeline). */
    fase_pipeline_in?: string[];
    /** @deprecated Mantida pra compat durante a janela de migração da config no banco. */
    pipeline_stage_in?: string[];
    tem_compromisso_ativo?: boolean;
    tem_pausa_ativa?: boolean;
  };
};

const FILTROS_DEFAULT: FiltrosCronjob = {
  nivel_engajamento_minimo: "morno",
  fases_aplicaveis: null,
  excluir_se: {
    fase_pipeline_in: ["fechado", "arquivado", "perdido"],
    tem_compromisso_ativo: true,
    tem_pausa_ativa: true,
  },
};

/** Lê chave canônica `fase_pipeline_in`; se ausente, cai em `pipeline_stage_in` (compat). */
function fasesExcluidas(f: FiltrosCronjob): string[] | undefined {
  return f.excluir_se.fase_pipeline_in ?? f.excluir_se.pipeline_stage_in;
}

let _filtrosCache: { value: FiltrosCronjob; expira: number } | null = null;

export async function carregarFiltrosCronjob(
  supabase: SupabaseClient,
): Promise<FiltrosCronjob> {
  if (_filtrosCache && Date.now() < _filtrosCache.expira) {
    return _filtrosCache.value;
  }
  const { data } = await supabase
    .from("agendamentos_config")
    .select("parametros")
    .eq("nome", "cron-sweep-triggers-temporais")
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  const filtrosRaw = (data?.parametros as any)?.filtros;
  const value: FiltrosCronjob = filtrosRaw && typeof filtrosRaw === "object"
    ? { ...FILTROS_DEFAULT, ...filtrosRaw, excluir_se: { ...FILTROS_DEFAULT.excluir_se, ...(filtrosRaw.excluir_se ?? {}) } }
    : FILTROS_DEFAULT;
  _filtrosCache = { value, expira: Date.now() + 60_000 };
  return value;
}

const NIVEL_RANK: Record<string, number> = { frio: 0, morno: 1, quente: 2 };

// ---------------------------------------------------------------------------
// Cria scheduled_action 'planejar_retomada' (DEC-017).
// Cron é vigia mudo · LLM (Gemma+Flash) decide depois quando+ângulo+assunto.
// Aplica filtros de curadoria antes de criar (cinto + suspensório · sweepers
// também podem aplicar filtros parciais por performance, mas aqui é o gate
// final).
// ---------------------------------------------------------------------------
export interface OpcoesEnfileirarAcao {
  /** Troca o gate de engajamento mínimo do cronjob. 'qualquer' = só a faixa do
   *  próprio gatilho decide (usado por gatilhos de score por faixa: um gatilho
   *  com faixa_alvo='frio' NÃO pode ser barrado pelo filtro genérico "min. morno"). */
  nivelMinimo?: "frio" | "morno" | "quente" | "qualquer";
}

export async function enfileirarAcaoTemporal(
  supabase: SupabaseClient,
  conv: ConversaAtiva,
  trigger: TriggerTemporal,
  condicaoTipo: string,
  opcoes?: OpcoesEnfileirarAcao,
): Promise<void> {
  // DEC-014 prioridade compromisso (mantido)
  const { data: temCompromisso } = await supabase.rpc("existe_compromisso_ativo", {
    p_conversation_id: conv.id,
  });
  if (temCompromisso === true) return;

  // Carrega filtros configurados em cronjobs_config.parametros.filtros
  const filtros = await carregarFiltrosCronjob(supabase);

  // Filtro · fase_pipeline do lead
  const fasesExcl = fasesExcluidas(filtros);
  if (fasesExcl?.length) {
    const { data: leadRow } = await supabase
      .from("leads")
      .select("fase_pipeline")
      .eq("id", conv.lead_id)
      .maybeSingle();
    const stage = leadRow?.fase_pipeline as string | undefined;
    if (stage && fasesExcl.includes(stage)) return;
  }

  // Filtro · engagement.nivel mínimo (item 11: gatilho de score passa
  // 'nivelMinimo: "qualquer"' — a faixa_alvo do gatilho já é o gate real).
  const minRank = opcoes?.nivelMinimo === "qualquer"
    ? 0
    : NIVEL_RANK[opcoes?.nivelMinimo ?? filtros.nivel_engajamento_minimo] ?? 1;
  if (minRank > 0) {
    const { data: eng } = await supabase
      .from("engajamento_lead")
      .select("nivel")
      .eq("lead_id", conv.lead_id)
      .maybeSingle();
    const nivelRank = NIVEL_RANK[eng?.nivel ?? "frio"] ?? 0;
    if (nivelRank < minRank) return;
  }

  // Filtro · pausa ativa
  if (filtros.excluir_se.tem_pausa_ativa) {
    const { data: pausa } = await supabase
      .from("pausa_conversa")
      .select("id")
      .eq("conversation_id", conv.id)
      .gt("reativar_em", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (pausa) return;
  }

  // DEC-017 · Gate por toggle do tenant na automação correspondente.
  // Carrega configuracao.automacoes do agente ativo do tenant e checa o toggle
  // do cenário detectado. Se desligado, cron NEM cria a intent.
  const TOGGLE_POR_CONDICAO: Record<string, string> = {
    silencio_pos_fase: "silencio",
    nao_respondeu_proposta: "silencio",
    nao_assinou_contrato: "nao_assinou_contrato",
    nao_enviou_comprovante: "nao_enviou_comprovante",
    despedida_sem_data: "despedida_sem_data",
  };
  const toggleNome = TOGGLE_POR_CONDICAO[condicaoTipo];

  // Busca agent_id ativo do tenant pra preencher na scheduled_action + ler config.
  const { data: ag } = await supabase
    .from("agentes_usuario")
    .select("id, configuracao")
    .eq("user_id", conv.tenant_id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  // Gate por toggle do tenant (default true se config ausente)
  if (toggleNome) {
    // deno-lint-ignore no-explicit-any
    const automacoes = ((ag?.configuracao as any)?.automacoes) ?? {};
    const toggleConfig = automacoes[toggleNome];
    const ativo = toggleConfig === undefined
      ? true
      : (typeof toggleConfig === "object" ? toggleConfig?.ativo !== false : toggleConfig !== false);
    if (!ativo) return;
  }

  // ── Cérebro único de retomada (2026-06-13, flag USAR_RETOMADA_CEREBRO_UNICO) ──
  // O cron só INICIA: cria `retomada_planejada` (agora) → o MOTOR gera a fala 1x e ENGATILHA a bolha
  // na caixa de saída pro horário que o agente escolheu (espelha o lead). A fala só sai nesse horário.
  // Guarda anti-dup dupla: pula se (a) há retomada na fila OU (b) há bolha de retomada engatilhada
  // (caixa de saída pendente com scheduled_at futuro) — senão a próxima janela do cron duplicaria.
  // Reversão: env USAR_RETOMADA_CEREBRO_UNICO=false (volta ao planejar_retomada antigo).
  const _cerebroUnico = (Deno.env.get("USAR_RETOMADA_CEREBRO_UNICO") ?? "true") !== "false";
  if (_cerebroUnico) {
    const _futuro = new Date(Date.now() + 5 * 60_000).toISOString();
    const [acaoRes, bolhaRes] = await Promise.all([
      supabase.from("acoes_agendadas").select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .in("action_type", ["retomada_planejada", "planejar_retomada"])
        .in("status", ["pendente", "processando"]),
      supabase.from("caixa_saida_mensagens").select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id).eq("status", "pendente").gt("scheduled_at", _futuro),
    ]);
    if ((acaoRes.count ?? 0) > 0 || (bolhaRes.count ?? 0) > 0) {
      console.info(`[sweep-temporais] cérebro único: retomada já pendente/engatilhada conv=${conv.id} — não duplica`);
      return;
    }
  }
  // Fix 2026-05-11 · DEC-017 cria a ação via RPC central `enfileirar_acao_agendada` (UPSERT
  // idempotente: 1 ação pendente/processando por conversation_id+action_type+scheduled_at).
  // App-side `jaDisparouRecente()` cobre a janela 24h por trigger_id (chamada nos sweeps antes).
  const { data: novoId, error } = await supabase.rpc("enfileirar_acao_agendada", {
    p_conversation_id: conv.id,
    p_lead_id: conv.lead_id,
    p_agente_id: ag?.id ?? null,
    p_tenant_id: conv.tenant_id,
    p_action_type: _cerebroUnico ? "retomada_planejada" : "planejar_retomada",
    p_scheduled_at: new Date().toISOString(),
    p_carga: {
      origem: "trigger_temporal",
      trigger_id: trigger.id,
      trigger_nome: trigger.nome_trigger,
      condicao_tipo: condicaoTipo,
      tom: trigger.acao_payload?.tom ?? "empatico",
      tentativa: trigger.acao_payload?.tentativa ?? 1,
    },
  });

  if (error) {
    console.error(
      `[sweep-temporais] falha ao criar planejar_retomada trigger=${trigger.id} conv=${conv.id}:`,
      error.message,
    );
    return;
  }

  if (!novoId) {
    console.warn(
      `[sweep-temporais] dedup pelo banco trigger=${trigger.id} conv=${conv.id} (acao pendente ja existia)`,
    );
  }
}
