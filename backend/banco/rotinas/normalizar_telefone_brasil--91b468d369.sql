CREATE OR REPLACE FUNCTION public.normalizar_telefone_brasil(p_bruto text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v text := regexp_replace(coalesce(p_bruto, ''), '\D', '', 'g');
begin
  v := regexp_replace(v, '^0+', '');
  if v ~ '^55\d{10,11}$' then
    return v;
  end if;
  if v ~ '^\d{10,11}$' then
    return '55' || v;
  end if;
  return null;
end;
$function$

