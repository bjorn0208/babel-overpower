CREATE OR REPLACE FUNCTION public.liberar_trava_motor(p_conversation_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  DELETE FROM public.travas_conversa WHERE conversation_id = p_conversation_id;
$function$

