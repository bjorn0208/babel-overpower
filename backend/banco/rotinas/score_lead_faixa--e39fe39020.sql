CREATE OR REPLACE FUNCTION public.score_lead_faixa(p_score integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN p_score >= 70 THEN 'quente' WHEN p_score >= 40 THEN 'morno' ELSE 'frio' END;
$function$

