CREATE OR REPLACE FUNCTION public.desativar_pausa_conversa(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.pausa_conversa
  WHERE conversation_id = p_conversation_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$function$

