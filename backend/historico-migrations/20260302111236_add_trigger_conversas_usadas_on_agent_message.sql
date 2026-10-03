
-- Trigger: atualiza conversas_usadas quando agente envia mensagem
-- Regra: 1 conversa = 30 msgs do agente. 31 msgs = 2 conversas.
-- Incrementa +1 na 1a msg (count=1) e a cada boundary de 30 (count=31,61,91...)

CREATE OR REPLACE FUNCTION public.update_conversas_on_agent_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_agent_count integer;
BEGIN
  -- Só conta mensagens do agente
  IF NEW.role != 'assistant' THEN RETURN NEW; END IF;

  -- Buscar tenant_id da conversa
  SELECT tenant_id INTO v_tenant_id
  FROM public.conversations WHERE id = NEW.conversation_id;

  IF v_tenant_id IS NULL THEN RETURN NEW; END IF;

  -- Contar mensagens do agente nesta conversa (inclui a recém-inserida)
  SELECT COUNT(*) INTO v_agent_count
  FROM public.messages
  WHERE conversation_id = NEW.conversation_id AND role = 'assistant';

  -- Incrementa na 1a msg (count=1) ou ao cruzar boundary de 30 (count=31,61,91...)
  IF v_agent_count = 1 OR (v_agent_count > 1 AND (v_agent_count % 30) = 1) THEN
    UPDATE public.user_subscriptions
    SET conversas_usadas = COALESCE(conversas_usadas, 0) + 1, updated_at = now()
    WHERE user_id = v_tenant_id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger AFTER INSERT na tabela messages
DROP TRIGGER IF EXISTS trg_update_conversas_on_agent_message ON public.messages;
CREATE TRIGGER trg_update_conversas_on_agent_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversas_on_agent_message();

-- Recalcular conversas_usadas para todos os tenants existentes
WITH agent_msg_counts AS (
  SELECT m.conversation_id, COUNT(*) as cnt
  FROM public.messages m
  WHERE m.role = 'assistant'
  GROUP BY m.conversation_id
),
tenant_usage AS (
  SELECT
    c.tenant_id,
    SUM(CEIL(amc.cnt::numeric / 30))::integer as correct_units
  FROM agent_msg_counts amc
  JOIN public.conversations c ON c.id = amc.conversation_id
  WHERE c.tenant_id IS NOT NULL
  GROUP BY c.tenant_id
)
UPDATE public.user_subscriptions us
SET conversas_usadas = tu.correct_units, updated_at = now()
FROM tenant_usage tu
WHERE us.user_id = tu.tenant_id AND us.status = 'active';

-- Zerar tenants sem conversas
UPDATE public.user_subscriptions
SET conversas_usadas = 0, updated_at = now()
WHERE status = 'active'
AND user_id NOT IN (
  SELECT DISTINCT tenant_id FROM public.conversations WHERE tenant_id IS NOT NULL
);

-- Index pra performance do COUNT no trigger
CREATE INDEX IF NOT EXISTS idx_messages_conversation_role
ON public.messages (conversation_id, role);

;
