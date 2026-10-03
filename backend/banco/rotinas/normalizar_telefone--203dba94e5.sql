CREATE OR REPLACE FUNCTION public.normalizar_telefone(p_tel text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT regexp_replace(coalesce(p_tel, ''), '[^0-9]', '', 'g');
$function$

