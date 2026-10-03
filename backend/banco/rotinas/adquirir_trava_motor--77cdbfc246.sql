CREATE OR REPLACE FUNCTION public.adquirir_trava_motor(p_conversation_id uuid, p_ttl_segundos integer DEFAULT 180)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_linhas integer;
BEGIN
  INSERT INTO public.travas_conversa (conversation_id, locked_at, expires_at)
  VALUES (p_conversation_id, now(), now() + make_interval(secs => p_ttl_segundos))
  ON CONFLICT (conversation_id) DO UPDATE
    SET locked_at = now(), expires_at = now() + make_interval(secs => p_ttl_segundos)
    WHERE public.travas_conversa.expires_at < now();
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas > 0;
END;
$function$

