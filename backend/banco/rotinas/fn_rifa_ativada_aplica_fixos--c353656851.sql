CREATE OR REPLACE FUNCTION public.fn_rifa_ativada_aplica_fixos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status = 'ativa' and (tg_op = 'INSERT' or old.status is distinct from 'ativa') then
    perform public.sincronizar_numeros_fixos_rifa(new.id);
  end if;
  return new;
end;
$function$

