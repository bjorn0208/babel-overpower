CREATE OR REPLACE FUNCTION public.tg_ativacao_kit_pacote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  begin
    if new.ligado and (tg_op = 'INSERT' or not coalesce(old.ligado, false)) then
      perform public.instalar_kit_pacote(new.pacote_id, new.agente_id);
    elsif not new.ligado and tg_op = 'UPDATE' and coalesce(old.ligado, false) then
      perform public.desinstalar_kit_pacote(new.pacote_id, new.agente_id);
    end if;
  exception when others then
    raise warning 'kit do pacote % no agente % falhou: %', new.pacote_id, new.agente_id, sqlerrm;
  end;
  return new;
end;
$function$

