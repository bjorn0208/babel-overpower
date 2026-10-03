CREATE OR REPLACE FUNCTION public.integracao_confirmar_ativacao(p_user_id uuid, p_plano_id uuid, p_com_implantacao boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  _plano public.loja_planos%rowtype;
  _impl  record;
  _valor_impl numeric := 0;
begin
  if p_user_id is null or p_plano_id is null then
    raise exception 'p_user_id e p_plano_id obrigatórios';
  end if;
  select * into _plano from public.loja_planos where id = p_plano_id;
  if _plano.id is null then raise exception 'plano % não existe', p_plano_id; end if;

  if p_com_implantacao then
    select * into _impl from public.loja_implantacao where is_active limit 1;
    if _impl.id is not null then
      insert into public.pedidos_compra (user_id, tipo, item_id, item_nome, item_preco, status)
      values (p_user_id, 'implantacao', _impl.id, _impl.nome, _impl.preco, 'aprovado');
      _valor_impl := coalesce(_impl.preco, 0);
    end if;
  end if;

  insert into public.pedidos_compra (user_id, tipo, item_id, item_nome, item_preco, status)
  values (p_user_id, 'plano', _plano.id, _plano.nome, _plano.preco_mensal, 'aprovado');

  insert into public.assinaturas_usuario
    (user_id, plano_id, plano_nome, status, max_conversas, conversas_usadas,
     max_ciclos_por_conversa, data_inicio, data_expiracao, preco)
  values
    (p_user_id, _plano.id, _plano.nome, 'ativa', _plano.max_conversas, 0,
     _plano.max_ciclos_por_conversa, now(),
     now() + make_interval(days => coalesce(_plano.dias_expiracao, 30)), _plano.preco_mensal)
  on conflict (user_id) do update set
    plano_id = excluded.plano_id, plano_nome = excluded.plano_nome,
    status = 'ativa', max_conversas = excluded.max_conversas,
    conversas_usadas = 0, max_ciclos_por_conversa = excluded.max_ciclos_por_conversa,
    data_inicio = now(), data_expiracao = excluded.data_expiracao,
    preco = excluded.preco;

  update public.profiles
     set account_status = 'ativo', is_active = true,
         metadata = coalesce(metadata,'{}'::jsonb) - 'degustacao_ate'
   where id = p_user_id;

  return jsonb_build_object('ok', true, 'plano', _plano.nome,
    'valor_plano', _plano.preco_mensal, 'valor_implantacao', _valor_impl);
end;
$function$

