CREATE OR REPLACE FUNCTION public.telefones_equivalentes(p_phone text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_bruto text := coalesce(p_phone, '');
  v_dig   text := regexp_replace(v_bruto, '\D', '', 'g');
  v_ddd   text;
  v_local text;
  v_out   text[] := ARRAY[]::text[];
begin
  -- Mesma regra de `supabase/functions/_shared/telefone.ts` (variantesTelefone):
  -- número BR com e sem o 9º dígito. O WhatsApp devolve o JID antigo (sem o 9)
  -- para muitos celulares; o app grava com o 9. As duas formas são o MESMO lead.
  if v_bruto <> '' then v_out := array_append(v_out, v_bruto); end if;
  if v_dig <> '' and v_dig <> v_bruto then v_out := array_append(v_out, v_dig); end if;
  if v_dig ~ '^55\d{10}$' then
    v_ddd := substr(v_dig, 3, 2);
    v_local := substr(v_dig, 5);
    if v_local ~ '^[6-9]' then v_out := array_append(v_out, '55' || v_ddd || '9' || v_local); end if;
  elsif v_dig ~ '^55\d{11}$' then
    v_ddd := substr(v_dig, 3, 2);
    v_local := substr(v_dig, 5);
    if v_local ~ '^9[6-9]' then v_out := array_append(v_out, '55' || v_ddd || substr(v_local, 2)); end if;
  end if;
  return v_out;
end;
$function$

