-- Habilita Realtime pra admin receber prompts em real-time (postgres_changes)
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_prompts;

-- RPC pra platform_admin buscar todos os prompts de uma conversa de uma vez.
-- SECURITY DEFINER + check de role no próprio corpo.
CREATE OR REPLACE FUNCTION public.get_conversation_prompts(p_conversation_id UUID)
RETURNS TABLE (
  message_id UUID,
  system_prompt TEXT,
  user_message TEXT,
  chunks_usados JSONB,
  trigger_disparado JSONB,
  rag_ativacao JSONB,
  turno_tipo TEXT,
  fase_atual TEXT,
  modelo TEXT,
  bolhas_count INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.system_role = 'platform_admin'
  ) THEN
    RAISE EXCEPTION 'acesso restrito a platform_admin';
  END IF;

  RETURN QUERY
  SELECT mp.message_id, mp.system_prompt, mp.user_message,
         mp.chunks_usados, mp.trigger_disparado, mp.rag_ativacao,
         mp.turno_tipo, mp.fase_atual, mp.modelo, mp.bolhas_count, mp.created_at
  FROM public.message_prompts mp
  WHERE mp.conversation_id = p_conversation_id
  ORDER BY mp.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_prompts(UUID) TO authenticated;
;
