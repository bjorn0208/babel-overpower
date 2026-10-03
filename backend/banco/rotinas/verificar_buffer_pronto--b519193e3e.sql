CREATE OR REPLACE FUNCTION public.verificar_buffer_pronto(p_phone text, p_agent_id uuid, p_threshold_seconds integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_buf record;
BEGIN
  SELECT * INTO v_buf FROM public.buffer_mensagens WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false;
  IF v_buf IS NULL THEN RETURN jsonb_build_object('ready', false, 'exists', false); END IF;
  RETURN jsonb_build_object('ready', (NOT v_buf.is_composing AND (now() - v_buf.last_activity_at) >= make_interval(secs => p_threshold_seconds)),
    'exists', true, 'is_composing', v_buf.is_composing,
    'age_ms', EXTRACT(EPOCH FROM (now() - v_buf.last_activity_at)) * 1000, 'count', jsonb_array_length(v_buf.mensagens));
END;
$function$

