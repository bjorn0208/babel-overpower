CREATE OR REPLACE FUNCTION public.substituir_caixa_saida_pendentes(p_conversation_id uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.caixa_saida_mensagens SET status = 'substituida', updated_at = now()
  WHERE conversation_id = p_conversation_id
    AND status IN ('pending','pendente')
    AND (p_since IS NULL OR created_at < p_since)
    AND COALESCE(carga->>'inviolavel','') <> 'true';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$

