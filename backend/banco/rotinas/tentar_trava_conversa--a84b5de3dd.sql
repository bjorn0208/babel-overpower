CREATE OR REPLACE FUNCTION public.tentar_trava_conversa(p_conversation_id uuid, p_ttl_seconds integer DEFAULT 30)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.travas_conversa (conversation_id, locked_at, expires_at)
  VALUES (p_conversation_id, now(), now() + (p_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (conversation_id)
  DO UPDATE SET locked_at = now(), expires_at = now() + (p_ttl_seconds || ' seconds')::interval
  WHERE public.travas_conversa.expires_at < now();
  RETURN FOUND;
END;
$function$

