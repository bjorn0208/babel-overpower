CREATE OR REPLACE FUNCTION public.limpar_traces_antigos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_apagados int;
BEGIN
  WITH apagar AS (
    DELETE FROM public.traces
    WHERE criado_em < now() - interval '90 days'
    RETURNING id
  )
  SELECT count(*)::int INTO v_apagados FROM apagar;
  RETURN v_apagados;
END;
$function$

