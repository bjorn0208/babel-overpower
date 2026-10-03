CREATE OR REPLACE FUNCTION public.info_sala_publica(p_chave uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sala public.salas_reuniao%rowtype;
  v_empresa record;
  v_perfil record;
begin
  select * into v_sala from public.salas_reuniao
    where chave_publica = p_chave and deleted_at is null;
  if not found then
    raise exception 'sala_nao_encontrada';
  end if;

  select nome, logo_url, banner_url, descricao, cidade, estado
    into v_empresa
    from public.empresas where user_id = v_sala.tenant_id
    limit 1;

  select headline, chips
    into v_perfil
    from public.perfil_publico where user_id = v_sala.tenant_id and is_active = true
    limit 1;

  return jsonb_build_object(
    'titulo', v_sala.titulo,
    'status', v_sala.status,
    'exige_aprovacao', v_sala.exige_aprovacao,
    'agendada_para', v_sala.agendada_para,
    'empresa_nome', v_empresa.nome,
    'empresa_logo_url', v_empresa.logo_url,
    'empresa_banner_url', v_empresa.banner_url,
    'empresa_descricao', v_empresa.descricao,
    'empresa_cidade', v_empresa.cidade,
    'empresa_estado', v_empresa.estado,
    'empresa_headline', v_perfil.headline,
    'empresa_chips', v_perfil.chips
  );
end;
$function$

