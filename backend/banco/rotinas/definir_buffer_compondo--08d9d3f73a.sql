CREATE OR REPLACE FUNCTION public.definir_buffer_compondo(p_phone text, p_agent_id uuid, p_composing boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_composing THEN
    UPDATE public.buffer_mensagens SET is_composing = true WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false;
  ELSE
    UPDATE public.buffer_mensagens SET is_composing = false, last_activity_at = now() WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false;
  END IF;
  RETURN jsonb_build_object('updated', FOUND);
END;
$function$

