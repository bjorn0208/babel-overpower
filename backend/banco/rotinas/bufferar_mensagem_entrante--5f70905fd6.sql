CREATE OR REPLACE FUNCTION public.bufferar_mensagem_entrante(p_phone text, p_agent_id uuid, p_channel_id uuid, p_text text, p_media_url text DEFAULT NULL::text, p_media_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_existing record; v_msg jsonb;
BEGIN
  v_msg := jsonb_build_object(
    'text', COALESCE(p_text, ''), 'media_url', p_media_url,
    'media_type', p_media_type, 'received_at', now());
  SELECT * INTO v_existing FROM public.buffer_mensagens
  WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false FOR UPDATE;
  IF v_existing IS NULL THEN
    INSERT INTO public.buffer_mensagens (phone, agente_id, channel_id, mensagens, is_composing, first_at, last_activity_at)
    VALUES (p_phone, p_agent_id, p_channel_id, jsonb_build_array(v_msg), false, now(), now());
    RETURN jsonb_build_object('is_first', true);
  ELSE
    UPDATE public.buffer_mensagens
    SET mensagens = mensagens || jsonb_build_array(v_msg), is_composing = false, last_activity_at = now()
    WHERE id = v_existing.id;
    RETURN jsonb_build_object('is_first', false);
  END IF;
END;
$function$

