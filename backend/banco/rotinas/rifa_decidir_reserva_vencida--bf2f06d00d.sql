CREATE OR REPLACE FUNCTION public.rifa_decidir_reserva_vencida(p_pedido uuid, p_decisao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p public.pedidos_rifa%rowtype;
  v_valor_unit integer;
  v_qtd integer := 0;
begin
  if p_decisao not in ('divida', 'sem_divida') then
    return jsonb_build_object('ok', false, 'erro', 'decisao_invalida');
  end if;

  select * into v_p from public.pedidos_rifa where id = p_pedido;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado');
  end if;
  if v_p.tenant_id is distinct from (select auth.uid()) then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  end if;
  if v_p.status <> 'reservado' then
    return jsonb_build_object('ok', false, 'erro', 'pedido_nao_esta_reservado');
  end if;

  if p_decisao = 'divida' then
    -- Rateia o valor do pedido pelos números pra respeitar promoção (mesma conta da cron antiga).
    v_valor_unit := greatest(1, round(v_p.valor_centavos::numeric / greatest(1, coalesce(v_p.qtd_numeros, 1)))::int);
    insert into public.rifa_dividas (tenant_id, rifa_id, numero, nome, phone, valor_centavos, origem, sorteio_em)
    select v_p.tenant_id, v_p.rifa_id, n, coalesce(v_p.nome, 'Sem nome'), v_p.phone, v_valor_unit, 'reserva',
           coalesce(public.rifa_sorteio_em(v_p.rifa_id), now())
    from unnest(coalesce(v_p.numeros, '{}')) n
    on conflict (rifa_id, numero) do nothing;
    get diagnostics v_qtd = row_count;
    update public.pedidos_rifa
    set divida_gerada_em = now(), divida_dispensada_em = null, updated_at = now()
    where id = p_pedido;
  else
    update public.pedidos_rifa
    set divida_dispensada_em = now(), updated_at = now()
    where id = p_pedido;
  end if;

  return jsonb_build_object('ok', true, 'decisao', p_decisao, 'dividas_criadas', v_qtd);
end;
$function$

