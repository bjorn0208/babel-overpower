-- FASE 1 · Item #1 do ALTERAÇOES.md · Ledger conversation_tickets + trigger idempotente
-- + RPCs de gestão de ciclo + reescrita save_turn_results + backfill + recalc + cron novo.
-- Objetivo: fonte única de escrita do contador. Remove dupla contagem. Ignora plano vencido.

-- ============================================================================
-- 1) Ledger conversation_tickets + RLS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conversation_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  origem text NOT NULL CHECK (origem IN ('espontaneo','campanha')),
  campaign_lead_id uuid REFERENCES public.campaign_leads(id) ON DELETE SET NULL,
  ciclo_bucket int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, conversation_id, origem, campaign_lead_id, ciclo_bucket)
);
CREATE INDEX IF NOT EXISTS idx_conversation_tickets_tenant_created ON public.conversation_tickets (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_tickets_conv          ON public.conversation_tickets (conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tickets_camp_lead     ON public.conversation_tickets (campaign_lead_id) WHERE campaign_lead_id IS NOT NULL;

ALTER TABLE public.conversation_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read_own_tickets ON public.conversation_tickets;
CREATE POLICY tenant_read_own_tickets ON public.conversation_tickets
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS service_role_all_tickets ON public.conversation_tickets;
CREATE POLICY service_role_all_tickets ON public.conversation_tickets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_tickets ON public.conversation_tickets;
CREATE POLICY admin_all_tickets ON public.conversation_tickets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND system_role='platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND system_role='platform_admin'));

-- ============================================================================
-- 2) ALTER messages ADD campaign_lead_id + index defensivo user_subscriptions
-- ============================================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS campaign_lead_id uuid REFERENCES public.campaign_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_campaign_lead  ON public.messages(campaign_lead_id) WHERE campaign_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status_data_exp ON public.user_subscriptions(status, data_expiracao);

-- ============================================================================
-- 3) DROP trigger antigo + DROP functions antigas
-- ============================================================================
DROP TRIGGER IF EXISTS trg_update_conversas_on_agent_message ON public.messages;
DROP FUNCTION IF EXISTS public.update_conversas_on_agent_message();
DROP FUNCTION IF EXISTS public.increment_conversas_usadas(uuid);

-- ============================================================================
-- 4) Nova trigger function: record_conversation_ticket
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_conversation_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_phone text;
  v_agent_count integer;
  v_ciclos integer;
  v_origem text;
  v_campaign_lead_id uuid;
  v_ciclo_bucket integer;
  v_inserted integer;
BEGIN
  IF NEW.role != 'assistant' THEN RETURN NEW; END IF;

  SELECT c.tenant_id, c.phone INTO v_tenant_id, v_phone
  FROM public.conversations c WHERE c.id = NEW.conversation_id;
  IF v_tenant_id IS NULL THEN RETURN NEW; END IF;

  IF v_phone IS NOT NULL AND v_phone LIKE 'chat-test%' THEN RETURN NEW; END IF;

  -- Só conta se plano ATIVO e não EXPIRADO
  SELECT COALESCE(us.max_ciclos_por_conversa, 30) INTO v_ciclos
  FROM public.user_subscriptions us
  WHERE us.user_id = v_tenant_id
    AND us.status = 'active'
    AND us.data_expiracao >= now()
  LIMIT 1;
  IF v_ciclos IS NULL THEN RETURN NEW; END IF;

  -- Origem + campaign_lead_id
  IF NEW.campaign_lead_id IS NOT NULL THEN
    v_origem := 'campanha';
    v_campaign_lead_id := NEW.campaign_lead_id;
    SELECT COUNT(*) INTO v_agent_count
    FROM public.messages m
    WHERE m.conversation_id = NEW.conversation_id
      AND m.role='assistant'
      AND m.campaign_lead_id = v_campaign_lead_id
      AND m.created_at <= NEW.created_at;
  ELSE
    v_origem := 'espontaneo';
    v_campaign_lead_id := NULL;
    SELECT COUNT(*) INTO v_agent_count
    FROM public.messages m
    WHERE m.conversation_id = NEW.conversation_id
      AND m.role='assistant'
      AND m.campaign_lead_id IS NULL
      AND m.created_at <= NEW.created_at;
  END IF;

  -- Só dispara ticket na 1ª msg de cada bucket (count=1, 1+ciclos, 1+2*ciclos...)
  IF (v_agent_count - 1) % v_ciclos = 0 THEN
    v_ciclo_bucket := floor((v_agent_count - 1)::numeric / v_ciclos::numeric)::int;

    INSERT INTO public.conversation_tickets (
      tenant_id, conversation_id, origem, campaign_lead_id, ciclo_bucket, created_at
    ) VALUES (
      v_tenant_id, NEW.conversation_id, v_origem, v_campaign_lead_id, v_ciclo_bucket, NEW.created_at
    ) ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      UPDATE public.user_subscriptions
      SET conversas_usadas = COALESCE(conversas_usadas, 0) + 1, updated_at = now()
      WHERE user_id = v_tenant_id AND status = 'active';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_record_conversation_ticket
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.record_conversation_ticket();

-- ============================================================================
-- 5) RPCs de gestão: get_conversas_usadas, refresh_cache, reset_cycle
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_conversas_usadas(p_tenant_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(*)::int FROM public.conversation_tickets ct
  WHERE ct.tenant_id = p_tenant_id
    AND ct.created_at >= (
      SELECT data_inicio FROM public.user_subscriptions
      WHERE user_id = p_tenant_id AND status='active' LIMIT 1
    );
$$;

CREATE OR REPLACE FUNCTION public.refresh_conversas_usadas_cache(p_tenant_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_count int;
BEGIN
  v_count := public.get_conversas_usadas(p_tenant_id);
  UPDATE public.user_subscriptions
  SET conversas_usadas = v_count, updated_at = now()
  WHERE user_id = p_tenant_id AND status='active';
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_subscription_cycle(p_user_id uuid, p_dias int DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.user_subscriptions
  SET conversas_usadas = 0,
      data_inicio = now(),
      data_expiracao = now() + (p_dias || ' days')::interval,
      updated_at = now()
  WHERE user_id = p_user_id AND status='active';
END;
$function$;

-- ============================================================================
-- 6) Reescreve save_turn_results · +p_campaign_lead_id · remove bloco de increment
-- ============================================================================
DROP FUNCTION IF EXISTS public.save_turn_results(uuid,uuid,text,text[],integer,text,jsonb,text,text[],uuid,text,integer,integer,numeric,integer,text,text,jsonb,jsonb);

CREATE OR REPLACE FUNCTION public.save_turn_results(
  p_conversation_id uuid, p_lead_card_id uuid, p_user_message text, p_agent_messages text[],
  p_ciclo integer, p_fase text, p_dados_capturados jsonb, p_resumo text, p_historico_fases text[],
  p_tenant_id uuid DEFAULT NULL::uuid, p_model text DEFAULT ''::text,
  p_prompt_tokens integer DEFAULT 0, p_completion_tokens integer DEFAULT 0,
  p_cost_usd numeric DEFAULT 0, p_latency_ms integer DEFAULT 0,
  p_media_url text DEFAULT NULL::text, p_media_type text DEFAULT NULL::text,
  p_agent_payload jsonb DEFAULT NULL::jsonb, p_llm_metadata jsonb DEFAULT '{}'::jsonb,
  p_campaign_lead_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_msg text;
  v_payload jsonb;
BEGIN
  v_payload := CASE
    WHEN p_media_url IS NOT NULL THEN jsonb_build_object('media_url', p_media_url, 'media_type', p_media_type)
    ELSE NULL
  END;

  INSERT INTO public.messages (conversation_id, role, content, payload, campaign_lead_id)
  VALUES (p_conversation_id, 'user', p_user_message, v_payload, p_campaign_lead_id);

  FOREACH v_msg IN ARRAY p_agent_messages LOOP
    INSERT INTO public.messages (conversation_id, role, content, payload, campaign_lead_id)
    VALUES (p_conversation_id, 'assistant', v_msg, p_agent_payload, p_campaign_lead_id);
  END LOOP;

  UPDATE public.lead_cards SET
    ciclo = p_ciclo, fase = p_fase, dados_capturados = p_dados_capturados,
    resumo = p_resumo, historico_fases = p_historico_fases, updated_at = now()
  WHERE id = p_lead_card_id;

  -- REMOVIDO (era bloco de dupla-contagem): IF p_ciclo=1 THEN UPDATE conversas_usadas
  -- Agora o trigger trg_record_conversation_ticket cuida da contagem via ledger.

  IF p_prompt_tokens > 0 THEN
    INSERT INTO public.api_usage_logs (tenant_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, conversation_id)
    VALUES (p_tenant_id, p_model, p_prompt_tokens, p_completion_tokens, p_prompt_tokens + p_completion_tokens, p_cost_usd, p_conversation_id);

    INSERT INTO public.llm_request_logs (model_slug, provider_nome, tokens_input, tokens_output, custo_total, tipo, status, duracao_ms, metadata)
    VALUES (p_model, 'openrouter', p_prompt_tokens, p_completion_tokens, p_cost_usd, 'chat', 'success', p_latency_ms, COALESCE(p_llm_metadata, '{}'::jsonb));
  END IF;
END;
$function$;

-- ============================================================================
-- 7) BACKFILL · popula conversation_tickets com histórico
-- ============================================================================
-- Lógica do trigger novo aplicada retroativamente: origem='espontaneo' (histórico
-- não tem campaign_lead_id porque a coluna nasce nessa migration).
INSERT INTO public.conversation_tickets (tenant_id, conversation_id, origem, campaign_lead_id, ciclo_bucket, created_at)
SELECT r.tenant_id, r.conversation_id, 'espontaneo'::text, NULL::uuid, (r.rn0 / r.ciclos)::int, r.created_at
FROM (
  SELECT
    m.conversation_id, c.tenant_id, m.created_at,
    (row_number() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) - 1) AS rn0,
    COALESCE(us.max_ciclos_por_conversa, 30) AS ciclos
  FROM public.messages m
  JOIN public.conversations c  ON c.id  = m.conversation_id
  JOIN public.user_subscriptions us ON us.user_id = c.tenant_id AND us.status='active'
  WHERE m.role='assistant'
    AND (c.phone IS NULL OR c.phone NOT LIKE 'chat-test%')
    AND m.created_at >= us.data_inicio
) r
WHERE r.rn0 % r.ciclos = 0
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8) RECALC · cache user_subscriptions.conversas_usadas = COUNT(tickets)
-- ============================================================================
UPDATE public.user_subscriptions us
SET conversas_usadas = COALESCE(
    (SELECT COUNT(*) FROM public.conversation_tickets ct
     WHERE ct.tenant_id = us.user_id AND ct.created_at >= us.data_inicio),
    0
  ),
  updated_at = now()
WHERE us.status='active';

-- ============================================================================
-- 9) CRONS · expire às 00:00 UTC (antes rodava 05:00/03:00 UTC)
-- ============================================================================
SELECT cron.unschedule('expire-subscriptions') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='expire-subscriptions');
SELECT cron.schedule('expire-subscriptions-midnight', '0 0 * * *', 'SELECT public.expire_subscriptions()');
;
