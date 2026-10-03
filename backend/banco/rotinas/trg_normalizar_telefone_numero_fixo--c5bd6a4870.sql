CREATE OR REPLACE FUNCTION public.trg_normalizar_telefone_numero_fixo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.phone is not null and new.phone <> '' then
    new.phone := coalesce(public.normalizar_telefone_brasil(new.phone), new.phone);
  end if;
  return new;
end;
$function$

