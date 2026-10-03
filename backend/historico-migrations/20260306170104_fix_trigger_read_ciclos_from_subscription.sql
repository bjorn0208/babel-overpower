
-- 1. Corrigir trigger: ler max_ciclos_por_conversa de user_subscriptions (per-plan)
CREATE OR REPLACE FUNCTION public.update_conversas_on_agent_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_phone text;
  v_agent_count integer;
  v_ciclos integer;
BEGIN
  IF NEW.role != 'assistant' THEN RETURN NEW; END IF;

  SELECT c.tenant_id, c.phone INTO v_tenant_id, v_phone
  FROM public.conversations c WHERE c.id = NEW.conversation_id;

  IF v_tenant_id IS NULL THEN RETURN NEW; END IF;
  IF v_phone IS NOT NULL AND v_phone LIKE 'chat-test%' THEN RETURN NEW; END IF;

  -- Ler ciclos_por_conversa da subscription do tenant (config admin por plano)
  SELECT COALESCE(us.max_ciclos_por_conversa, 30) INTO v_ciclos
  FROM public.user_subscriptions us
  WHERE us.user_id = v_tenant_id AND us.status = 'active'
  LIMIT 1;
  IF v_ciclos IS NULL OR v_ciclos < 1 THEN v_ciclos := 30; END IF;

  SELECT COUNT(*) INTO v_agent_count
  FROM public.messages
  WHERE conversation_id = NEW.conversation_id AND role = 'assistant';

  -- Incrementa na 1a msg e a cada N ciclos (boundary: count=1, 1+N, 1+2N...)
  IF v_agent_count = 1 OR (v_agent_count > 1 AND ((v_agent_count - 1) % v_ciclos) = 0) THEN
    UPDATE public.user_subscriptions
    SET conversas_usadas = COALESCE(conversas_usadas, 0) + 1, updated_at = now()
    WHERE user_id = v_tenant_id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Remover coluna desnecessaria de platform_settings
ALTER TABLE public.platform_settings DROP COLUMN IF EXISTS ciclos_por_conversa;

;
