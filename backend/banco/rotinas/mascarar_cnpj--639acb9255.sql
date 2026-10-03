CREATE OR REPLACE FUNCTION public.mascarar_cnpj(p_cnpj text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
  SELECT '**.***.***/****-' || right(regexp_replace(p_cnpj, '\D', '', 'g'), 2)
$function$

