
-- ============================================================
-- Wave 1 Ajuste R01.2 — supersede_outbox_pendentes standalone
-- UP: Remove função trigger (RETURNS trigger, não chamável via rpc)
--     Cria função normal chamável do edge function
-- DOWN: DROP FUNCTION IF EXISTS public.supersede_outbox_pendentes(uuid, timestamptz);
--       (recriar trg_message_outbox_supersede se necessário)
-- ============================================================

-- Remove função trigger anterior (RETURNS trigger — não chamável via rpc())
DROP FUNCTION IF EXISTS public.trg_message_outbox_supersede();

-- Cria função standalone chamável do edge function via rpc()
CREATE OR REPLACE FUNCTION public.supersede_outbox_pendentes(
  p_conversation_id uuid,
  p_since           timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Marca bolhas pending como superseded quando lead envia nova mensagem.
  -- p_since: se informado, cancela apenas bolhas criadas ANTES desse timestamp
  --          (proteção contra cancelar mensagem que chegou depois da msg do lead).
  -- Se NULL: cancela todas as pending da conversa (reset completo).
  UPDATE public.message_outbox
  SET
    status     = 'superseded',
    updated_at = now()
  WHERE conversation_id = p_conversation_id
    AND status          = 'pending'
    AND (p_since IS NULL OR created_at < p_since);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Somente service_role executa (função interna do motor — edge function usa service_role)
-- authenticated NÃO tem execute: evita que frontend chame diretamente
GRANT EXECUTE ON FUNCTION public.supersede_outbox_pendentes(uuid, timestamptz)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.supersede_outbox_pendentes(uuid, timestamptz)
  FROM PUBLIC;

COMMENT ON FUNCTION public.supersede_outbox_pendentes(uuid, timestamptz) IS
  'Marca bolhas pending como superseded quando lead envia nova mensagem (R01.2 Motor Vivo). '
  'Chamada pelo edge function chat/index.ts ao detectar nova mensagem do lead. '
  'p_since: timestamp da mensagem do lead — cancela apenas bolhas criadas ANTES. '
  'NULL = cancela todas as pending da conversa. Retorna count de rows afetadas.';

;
