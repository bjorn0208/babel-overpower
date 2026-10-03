CREATE OR REPLACE FUNCTION public.rifa_normalizar_hora(p_txt text)
 RETURNS time without time zone
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  m text[];
  h integer;
  mi integer;
begin
  if p_txt is null then return null; end if;
  m := regexp_match(btrim(p_txt), '^(\d{1,2})\s*[:hH]?\s*(\d{2})?');
  if m is null then return null; end if;
  h := m[1]::int;
  mi := coalesce(m[2], '0')::int;
  if h > 23 or mi > 59 then return null; end if;
  return make_time(h, mi, 0);
end;
$function$

