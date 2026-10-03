CREATE OR REPLACE FUNCTION public.obter_prompts_conversa(p_conversation_id uuid)
 RETURNS TABLE(message_id uuid, system_prompt text, user_message text, chunks_usados jsonb, trigger_disparado jsonb, rag_ativacao jsonb, turno_tipo text, fase_atual text, modelo text, bolhas_count integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
  FROM public.prompts_mensagem mp
  WHERE mp.conversation_id = p_conversation_id
  ORDER BY mp.created_at ASC;
END;
$function$

