
-- FIX BUG #6 (descoberto no smoke C1): conversations não tem deleted_at
CREATE OR REPLACE FUNCTION public.selecionar_conversas_amostra(
  p_limite int DEFAULT 50
)
RETURNS TABLE (
  conversation_id uuid,
  tenant_id uuid,
  lead_id uuid,
  num_messages int,
  ultima_mensagem_em timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH conversas_elegiveis AS (
    SELECT
      c.id AS conversation_id,
      c.tenant_id,
      c.lead_id,
      c.updated_at AS ultima_mensagem_em
    FROM public.conversations c
    WHERE (
        c.status = 'fechado'
        OR c.updated_at < now() - interval '24 hours'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.episodic_memory em
         WHERE em.conversation_id = c.id
      )
  ),
  com_contagem AS (
    SELECT
      ce.conversation_id,
      ce.tenant_id,
      ce.lead_id,
      ce.ultima_mensagem_em,
      (SELECT count(*)::int FROM public.messages m WHERE m.conversation_id = ce.conversation_id) AS num_messages
    FROM conversas_elegiveis ce
  )
  SELECT
    cc.conversation_id,
    cc.tenant_id,
    cc.lead_id,
    cc.num_messages,
    cc.ultima_mensagem_em
  FROM com_contagem cc
  WHERE cc.num_messages >= 4
  ORDER BY cc.ultima_mensagem_em DESC
  LIMIT p_limite;
END;
$$;

;
