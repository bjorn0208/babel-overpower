-- Blindagem do rebuffer (single-flight): se o par phone+agente nunca passou pelo buffer
-- (ex.: invocação direta do motor), resolve channel_id pelo canal do tenant dono do agente.
-- Sem canal nenhum, ainda insere com NULL se a coluna permitir — senão loga e não explode.
CREATE OR REPLACE FUNCTION public.rebufferar_mensagens(
  p_phone text, p_agent_id uuid, p_texto text,
  p_media_url text DEFAULT NULL, p_media_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_aberto record; v_channel uuid; v_msg jsonb;
BEGIN
  v_msg := jsonb_build_object('text', COALESCE(p_texto,''), 'media_url', p_media_url,
                              'media_type', p_media_type, 'received_at', now());
  SELECT * INTO v_aberto FROM public.buffer_mensagens
   WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false
   FOR UPDATE;
  IF v_aberto IS NOT NULL THEN
    UPDATE public.buffer_mensagens
       SET mensagens = jsonb_build_array(v_msg) || mensagens,
           first_at = LEAST(first_at, now())
     WHERE id = v_aberto.id;
    RETURN;
  END IF;

  SELECT channel_id INTO v_channel FROM public.buffer_mensagens
   WHERE phone = p_phone AND agente_id = p_agent_id
   ORDER BY created_at DESC LIMIT 1;
  IF v_channel IS NULL THEN
    SELECT c.id INTO v_channel FROM public.canais c
      JOIN public.agentes_usuario a ON a.user_id = c.user_id
     WHERE a.id = p_agent_id
     ORDER BY c.created_at DESC LIMIT 1;
  END IF;

  BEGIN
    INSERT INTO public.buffer_mensagens (phone, agente_id, channel_id, mensagens, is_composing, first_at, last_activity_at, processed)
    VALUES (p_phone, p_agent_id, v_channel, jsonb_build_array(v_msg), false, now(), now(), false);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rebufferar_mensagens: insert falhou (phone=%, agente=%): %', p_phone, p_agent_id, SQLERRM;
  END;
END;
$$;
;
