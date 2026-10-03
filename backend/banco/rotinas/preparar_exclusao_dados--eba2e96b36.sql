CREATE OR REPLACE FUNCTION public.preparar_exclusao_dados(p_owner uuid, p_conversa uuid, p_sql text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1 from public.profiles pr
    where pr.id = p_owner
      and pr.parent_user_id is not null
      and coalesce(pr.system_role, '') <> 'platform_admin'
  ) then
    return jsonb_build_object('ok', false, 'erro',
      'sem_permissao: excluir dados da conta é privilégio do dono. Peça ao titular.');
  end if;
  return public.preparar_exclusao_dados_nucleo(p_owner, p_conversa, p_sql);
end;
$function$

