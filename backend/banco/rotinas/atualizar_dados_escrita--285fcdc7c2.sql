CREATE OR REPLACE FUNCTION public.atualizar_dados_escrita(p_owner uuid, p_sql text, p_confirmar_em_massa boolean DEFAULT false)
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
      'sem_permissao: alterar dados da conta é privilégio do dono. Peça ao titular.');
  end if;
  return public.atualizar_dados_escrita_nucleo(p_owner, p_sql, p_confirmar_em_massa);
end;
$function$

