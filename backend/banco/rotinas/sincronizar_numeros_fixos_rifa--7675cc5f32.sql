CREATE OR REPLACE FUNCTION public.sincronizar_numeros_fixos_rifa(p_rifa uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_r public.rifas%rowtype;
  v_min integer;
  v_max integer;
  v_pessoa record;
  v_pedido_id uuid;
  v_reservados integer := 0;
  v_liberados integer := 0;
  v_nums integer[];
begin
  -- Tranca de identidade (2026-09-08): não pode viver só no GRANT.
  PERFORM public.tenant_efetivo();
  select * into v_r from public.rifas
  where id = p_rifa and deleted_at is null
    and (v_uid is null or tenant_id = v_uid);
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_encontrada');
  end if;
  if v_r.status not in ('ativa') then
    return jsonb_build_object('ok', true, 'obs', 'rifa_nao_ativa_nada_a_fazer');
  end if;

  v_min := case when v_r.numeracao_desde_zero then 0 else 1 end;
  v_max := v_min + v_r.total_numeros - 1;

  with alvo as (
    select nr.id, nr.pedido_id
    from public.numeros_rifa nr
    join public.pedidos_rifa p on p.id = nr.pedido_id
    where nr.rifa_id = v_r.id
      and nr.status = 'reservado'
      and p.origem = 'manual' and p.expira_em is null
      and not exists (
        select 1 from public.rifa_numeros_fixos f
        where f.tenant_id = v_r.tenant_id
          and f.metodo_sorteio = v_r.metodo_sorteio
          and f.numero = nr.numero
          and f.status = 'ativo'
      )
  ), del as (
    delete from public.numeros_rifa nr using alvo
    where nr.id = alvo.id
    returning nr.pedido_id
  )
  select count(*) into v_liberados from del;

  for v_pessoa in
    select coalesce(f.phone, '') as phone, f.nome,
           array_agg(f.numero order by f.numero) as numeros
    from public.rifa_numeros_fixos f
    where f.tenant_id = v_r.tenant_id
      and f.metodo_sorteio = v_r.metodo_sorteio
      and f.status = 'ativo'
      and f.numero between v_min and v_max
      and not exists (
        select 1 from public.numeros_rifa nr
        where nr.rifa_id = v_r.id and nr.numero = f.numero
      )
    group by coalesce(f.phone, ''), f.nome
  loop
    insert into public.pedidos_rifa (
      rifa_id, tenant_id, nome, phone, origem,
      qtd_numeros, numeros, valor_centavos, status, expira_em
    ) values (
      v_r.id, v_r.tenant_id, v_pessoa.nome, nullif(v_pessoa.phone, ''), 'manual',
      array_length(v_pessoa.numeros, 1), '{}',
      array_length(v_pessoa.numeros, 1) * v_r.preco_numero_centavos,
      'reservado', null
    ) returning id into v_pedido_id;

    insert into public.numeros_rifa (rifa_id, tenant_id, pedido_id, numero, status)
    select v_r.id, v_r.tenant_id, v_pedido_id, n, 'reservado'
    from unnest(v_pessoa.numeros) n
    on conflict (rifa_id, numero) do nothing;

    select array_agg(numero order by numero) into v_nums
    from public.numeros_rifa where pedido_id = v_pedido_id;

    update public.pedidos_rifa
    set numeros = coalesce(v_nums, '{}'),
        qtd_numeros = coalesce(array_length(v_nums, 1), 0),
        valor_centavos = coalesce(array_length(v_nums, 1), 0) * v_r.preco_numero_centavos,
        updated_at = now()
    where id = v_pedido_id;

    v_reservados := v_reservados + coalesce(array_length(v_nums, 1), 0);
  end loop;

  return jsonb_build_object('ok', true, 'reservados', v_reservados, 'liberados', v_liberados);
end;
$function$

