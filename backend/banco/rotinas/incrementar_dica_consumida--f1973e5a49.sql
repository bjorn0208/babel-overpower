CREATE OR REPLACE FUNCTION public.incrementar_dica_consumida(p_dica_id uuid, p_turno integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.dicas_dono
  SET consumida_no_turno = p_turno
  WHERE id = p_dica_id
    AND consumida_no_turno IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$

