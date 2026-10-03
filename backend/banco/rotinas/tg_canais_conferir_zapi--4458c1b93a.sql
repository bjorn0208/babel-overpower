CREATE OR REPLACE FUNCTION public.tg_canais_conferir_zapi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.type = 'whatsapp'
     and new.is_active
     and coalesce(new.zapi_instance_id, '') <> ''
     and coalesce(new.zapi_token, '') <> ''
  then
    perform public.disparar_vigia_canais_zapi(new.id);
  end if;
  return null;
end $function$

