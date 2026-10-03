CREATE OR REPLACE FUNCTION public.marcar_lida_em_notificacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.lida = true and (old.lida is distinct from true) then
    new.lida_em = now();
  end if;
  return new;
end;
$function$

