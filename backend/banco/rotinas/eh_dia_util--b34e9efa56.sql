CREATE OR REPLACE FUNCTION public.eh_dia_util(p_data date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    extract(dow FROM p_data)::int NOT IN (0, 6)
    AND NOT EXISTS (
      SELECT 1 FROM public.feriados_brasil
      WHERE data = p_data AND ativo = true AND escopo = 'nacional'
    );
$function$

