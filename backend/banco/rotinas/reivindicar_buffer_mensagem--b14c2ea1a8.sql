CREATE OR REPLACE FUNCTION public.reivindicar_buffer_mensagem(p_phone text, p_agent_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_buffer record;
BEGIN
  UPDATE public.buffer_mensagens SET processed = true WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false RETURNING * INTO v_buffer;
  IF v_buffer IS NULL THEN RETURN jsonb_build_object('mensagens', '[]'::jsonb, 'count', 0); END IF;
  RETURN jsonb_build_object('mensagens', v_buffer.mensagens, 'count', jsonb_array_length(v_buffer.mensagens),
    'first_at', v_buffer.first_at, 'last_at', v_buffer.last_activity_at, 'channel_id', v_buffer.channel_id);
END;
$function$

