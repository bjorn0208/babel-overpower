create or replace function public.normalizar_telefone_brasil(p_bruto text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
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
$$;

;
