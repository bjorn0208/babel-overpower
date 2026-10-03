CREATE OR REPLACE FUNCTION public.mascarar_cpf(p_cpf text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
  SELECT '***.***.***-' || right(regexp_replace(p_cpf, '\D', '', 'g'), 2)
$function$

