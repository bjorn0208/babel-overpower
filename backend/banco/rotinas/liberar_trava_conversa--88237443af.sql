CREATE OR REPLACE FUNCTION public.liberar_trava_conversa(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public.travas_conversa WHERE conversation_id = p_conversation_id;
END;
$function$

