CREATE OR REPLACE FUNCTION public.tg_bloco_conversa_padrao_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.category = 'conversa_padrao' and (new.deleted_at is not null or new.ativo = false) then
    update public.conversas_padrao set ativo = false, updated_at = now() where bloco_id = new.id and ativo;
  end if;
  return new;
end;
$function$

