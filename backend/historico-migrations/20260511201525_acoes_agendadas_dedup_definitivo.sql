-- ===========================================================
-- Fix definitivo de automacoes duplicadas em acoes_agendadas.
--
-- Camadas:
--   1. Partial UNIQUE index em (conversation_id, action_type, scheduled_at)
--      restrito a status IN ('pendente','processando') — libera apos terminal.
--   2. Substituir indice quebrado idx_scheduled_actions_pending_worker
--      (filtrava 'pending' EN; worker usa 'pendente' PT — nunca usado).
--   3. RPC enfileirar_acao_agendada(...): UPSERT idempotente. Insere ou
--      retorna id existente em conflito.
--   4. RPC pegar_proxima_acao_agendada(int): claim atomico via
--      SELECT FOR UPDATE SKIP LOCKED + DISTINCT ON por conversation_id.
--      Garante 1 acao por conversa por execucao e elimina race.
--   5. RPC liberar_zumbis(int): marca como 'falhou' acoes em status
--      'processando' ha mais de X minutos. Chamada no inicio do processador.
--
-- Cleanup das duplicatas pre-existentes ja foi feito via DML em 2026-05-11
-- (status='cancelado' com error_message='cleanup:duplicata_pre_uniq_2026_05_11').
-- ===========================================================

-- 1. Partial UNIQUE: 1 acao pendente/processando por (conversa, tipo, agendamento)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_acoes_agendadas_pendente_por_conv_tipo_horario
  ON public.acoes_agendadas (conversation_id, action_type, scheduled_at)
  WHERE status IN ('pendente','processando');

-- 2. Substituir indice quebrado (filtrava 'pending' EN inalcancavel pelo worker)
DROP INDEX IF EXISTS public.idx_scheduled_actions_pending_worker;
CREATE INDEX IF NOT EXISTS idx_acoes_agendadas_pendente_worker
  ON public.acoes_agendadas (scheduled_at)
  WHERE status = 'pendente';

-- 3. RPC enfileirar_acao_agendada — UPSERT idempotente
CREATE OR REPLACE FUNCTION public.enfileirar_acao_agendada(
  p_conversation_id uuid,
  p_lead_id         uuid,
  p_agente_id       uuid,
  p_tenant_id       uuid,
  p_action_type     text,
  p_scheduled_at    timestamptz,
  p_carga           jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.acoes_agendadas (
    conversation_id,
    lead_id,
    agente_id,
    tenant_id,
    action_type,
    scheduled_at,
    status,
    carga,
    created_at
  )
  VALUES (
    p_conversation_id,
    p_lead_id,
    p_agente_id,
    p_tenant_id,
    p_action_type,
    p_scheduled_at,
    'pendente',
    COALESCE(p_carga, '{}'::jsonb),
    now()
  )
  ON CONFLICT ON CONSTRAINT uniq_acoes_agendadas_pendente_por_conv_tipo_horario
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.acoes_agendadas
    WHERE conversation_id = p_conversation_id
      AND action_type     = p_action_type
      AND scheduled_at    = p_scheduled_at
      AND status IN ('pendente','processando')
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enfileirar_acao_agendada(uuid, uuid, uuid, uuid, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enfileirar_acao_agendada(uuid, uuid, uuid, uuid, text, timestamptz, jsonb) TO service_role;

COMMENT ON FUNCTION public.enfileirar_acao_agendada(uuid, uuid, uuid, uuid, text, timestamptz, jsonb)
  IS 'Insere acao agendada idempotente. Em conflito (mesma conversa/tipo/horario pendente), retorna id existente sem duplicar. Fonte da verdade pra todos os caminhos de criacao em chat/cron-varrer-gatilhos-temporais.';

-- 4. RPC pegar_proxima_acao_agendada — claim atomico, 1 por conversa
CREATE OR REPLACE FUNCTION public.pegar_proxima_acao_agendada(
  p_limite int DEFAULT 50
) RETURNS SETOF public.acoes_agendadas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH cand AS (
    SELECT DISTINCT ON (conversation_id) id
    FROM public.acoes_agendadas
    WHERE status = 'pendente'
      AND scheduled_at <= now()
    ORDER BY conversation_id, scheduled_at ASC, created_at ASC
    LIMIT p_limite
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.acoes_agendadas a
     SET status = 'processando',
         tentativas = COALESCE(a.tentativas, 0) + 1
    FROM cand
   WHERE a.id = cand.id
  RETURNING a.*;
END;
$$;

REVOKE ALL ON FUNCTION public.pegar_proxima_acao_agendada(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pegar_proxima_acao_agendada(int) TO service_role;

COMMENT ON FUNCTION public.pegar_proxima_acao_agendada(int)
  IS 'Atomic claim de proximas acoes pendentes. DISTINCT ON garante 1 por conversa; SKIP LOCKED elimina race entre instancias do cron. Marca como processando no mesmo statement (sem race entre SELECT e UPDATE).';

-- 5. RPC liberar_zumbis — reaper de acoes presas em processando
CREATE OR REPLACE FUNCTION public.liberar_zumbis(
  p_max_idade_minutos int DEFAULT 15
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.acoes_agendadas
     SET status = 'falhou',
         error_message = 'reaper:zumbi_processando_mais_de_' || p_max_idade_minutos || '_min'
   WHERE status = 'processando'
     AND COALESCE(executed_at, created_at) < now() - (p_max_idade_minutos || ' minutes')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.liberar_zumbis(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.liberar_zumbis(int) TO service_role;

COMMENT ON FUNCTION public.liberar_zumbis(int)
  IS 'Marca como falhou acoes presas em status processando ha mais de N minutos. Chamada no inicio de processar-acompanhamentos pra liberar slots travados. Sem trigger separado; SQL barato.';

;
