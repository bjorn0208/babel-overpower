CREATE OR REPLACE FUNCTION public.consultar_meus_numeros_rifa(p_token uuid, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r public.rifas%rowtype;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_pedidos jsonb;
begin
  if length(v_phone) < 10 then
    return jsonb_build_object('ok', false, 'erro', 'phone_invalido');
  end if;

  perform public.verificar_limite_taxa_publico(v_phone, 'rifa_meus_numeros', 20);

  select * into v_r from public.rifas
  where chave_publica = p_token and deleted_at is null;
  if not found or v_r.status = 'rascunho' then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_encontrada');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'status', p.status,
           'numeros', to_jsonb(p.numeros),
           'qtd', p.qtd_numeros,
           'valor_centavos', p.valor_centavos,
           'criado_em', p.created_at
         ) order by p.created_at desc), '[]'::jsonb)
    into v_pedidos
  from (
    select * from public.pedidos_rifa
    where rifa_id = v_r.id and phone = v_phone
    order by created_at desc
    limit 20
  ) p;

  return jsonb_build_object('ok', true, 'rifa_titulo', v_r.titulo, 'pedidos', v_pedidos);
end;
$function$

