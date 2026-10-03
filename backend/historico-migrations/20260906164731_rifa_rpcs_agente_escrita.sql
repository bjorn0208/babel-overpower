-- App Rifas — RPCs de escrita pro agente (Theus, 2026-09-06)
-- Core compartilhado + wrapper do app (auth.uid) + wrapper do agente (p_tenant_id, service_role).
-- Defaults dos wrappers do app PRESERVADOS (Postgres recusa create or replace que remove default).

create or replace function public.rifa_confirmar_pagamento_core(
  p_tenant uuid, p_pedido uuid, p_aprovar boolean, p_motivo text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p public.pedidos_rifa%rowtype;
  v_cotas_ganhas jsonb := '[]'::jsonb;
begin
  if p_tenant is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;

  select * into v_p from public.pedidos_rifa
  where id = p_pedido and tenant_id = p_tenant
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado');
  end if;
  if v_p.status in ('pago', 'expirado', 'cancelado') then
    return jsonb_build_object('ok', false, 'erro', 'pedido_ja_finalizado (' || v_p.status || ')');
  end if;

  if p_aprovar then
    update public.numeros_rifa set status = 'pago' where pedido_id = v_p.id;
    update public.pedidos_rifa
    set status = 'pago', pago_em = now(), expira_em = null, updated_at = now()
    where id = v_p.id;

    with novas as (
      select jsonb_agg(
        case when (c->>'pedido_ganhador') is null and (c->>'numero')::int = any(v_p.numeros)
          then c || jsonb_build_object('pedido_ganhador', v_p.id::text, 'ganhador_nome', v_p.nome)
          else c end) as cotas,
        coalesce(jsonb_agg(c || jsonb_build_object('ganhador_nome', v_p.nome))
          filter (where (c->>'pedido_ganhador') is null and (c->>'numero')::int = any(v_p.numeros)),
          '[]'::jsonb) as ganhas
      from jsonb_array_elements((select cotas_premiadas from public.rifas where id = v_p.rifa_id)) c
    )
    update public.rifas r
    set cotas_premiadas = coalesce(novas.cotas, r.cotas_premiadas), updated_at = now()
    from novas
    where r.id = v_p.rifa_id
    returning novas.ganhas into v_cotas_ganhas;

    return jsonb_build_object('ok', true, 'status', 'pago',
      'cotas_premiadas_ganhas', coalesce(v_cotas_ganhas, '[]'::jsonb));
  else
    delete from public.numeros_rifa where pedido_id = v_p.id;
    update public.pedidos_rifa
    set status = 'rejeitado', motivo_rejeicao = coalesce(p_motivo, 'comprovante rejeitado'),
        expira_em = null, updated_at = now()
    where id = v_p.id;
    return jsonb_build_object('ok', true, 'status', 'rejeitado');
  end if;
end;
$$;

revoke all on function public.rifa_confirmar_pagamento_core(uuid, uuid, boolean, text) from public;

create or replace function public.confirmar_pagamento_pedido_rifa(
  p_pedido uuid, p_aprovar boolean, p_motivo text default null
) returns jsonb language sql security definer set search_path = '' as $$
  select public.rifa_confirmar_pagamento_core((select auth.uid()), p_pedido, p_aprovar, p_motivo);
$$;

revoke all on function public.confirmar_pagamento_pedido_rifa(uuid, boolean, text) from public;
grant execute on function public.confirmar_pagamento_pedido_rifa(uuid, boolean, text) to authenticated, service_role;

create or replace function public.rifa_confirmar_pagamento_agente(
  p_tenant_id uuid, p_pedido uuid, p_aprovar boolean, p_motivo text default null
) returns jsonb language sql security definer set search_path = '' as $$
  select public.rifa_confirmar_pagamento_core(p_tenant_id, p_pedido, p_aprovar, p_motivo);
$$;

revoke all on function public.rifa_confirmar_pagamento_agente(uuid, uuid, boolean, text) from public;
grant execute on function public.rifa_confirmar_pagamento_agente(uuid, uuid, boolean, text) to service_role;

create or replace function public.rifa_sortear_core(
  p_tenant uuid, p_rifa uuid, p_numero_manual integer, p_numeros_manuais integer[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_r public.rifas%rowtype;
  v_min integer;
  v_max integer;
  v_premios text[];
  v_numeros integer[];
  v_qtd integer;
  v_numero integer;
  v_ped public.pedidos_rifa%rowtype;
  v_resultado jsonb := '[]'::jsonb;
  v_item jsonb;
  v_dividas integer := 0;
  i integer;
begin
  if p_tenant is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;

  select * into v_r from public.rifas
  where id = p_rifa and tenant_id = p_tenant and deleted_at is null
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_encontrada');
  end if;
  if v_r.status = 'sorteada' then
    return jsonb_build_object('ok', false, 'erro', 'rifa_ja_sorteada');
  end if;

  v_min := case when v_r.numeracao_desde_zero then 0 else 1 end;
  v_max := v_min + v_r.total_numeros - 1;

  select array[v_r.premio_principal] || coalesce(array_agg(e.value #>> '{}' order by e.ordinality), '{}')
    into v_premios
  from jsonb_array_elements(coalesce(v_r.premios_extras, '[]'::jsonb)) with ordinality e;
  v_qtd := coalesce(array_length(v_premios, 1), 1);

  if p_numeros_manuais is not null and array_length(p_numeros_manuais, 1) > 0 then
    if array_length(p_numeros_manuais, 1) <> v_qtd then
      return jsonb_build_object('ok', false, 'erro',
        'informar_um_numero_por_premio (' || v_qtd || ' prêmios)');
    end if;
    if exists (select 1 from unnest(p_numeros_manuais) n where n < v_min or n > v_max) then
      return jsonb_build_object('ok', false, 'erro', 'numero_fora_da_faixa');
    end if;
    if (select count(distinct n) from unnest(p_numeros_manuais) n) <> v_qtd then
      return jsonb_build_object('ok', false, 'erro', 'numeros_repetidos');
    end if;
    v_numeros := p_numeros_manuais;
  elsif p_numero_manual is not null then
    if v_qtd > 1 then
      return jsonb_build_object('ok', false, 'erro',
        'informar_um_numero_por_premio (' || v_qtd || ' prêmios)');
    end if;
    if p_numero_manual < v_min or p_numero_manual > v_max then
      return jsonb_build_object('ok', false, 'erro', 'numero_fora_da_faixa');
    end if;
    v_numeros := array[p_numero_manual];
  else
    select array_agg(numero) into v_numeros
    from (
      select numero from public.numeros_rifa
      where rifa_id = v_r.id and status = 'pago'
      order by random() limit v_qtd
    ) s;
    if v_numeros is null then
      return jsonb_build_object('ok', false, 'erro', 'sem_numeros_pagos');
    end if;
    if array_length(v_numeros, 1) < v_qtd then
      return jsonb_build_object('ok', false, 'erro',
        'pagos_insuficientes (' || array_length(v_numeros, 1) || ' pagos pra ' || v_qtd || ' prêmios)');
    end if;
  end if;

  for i in 1..v_qtd loop
    v_numero := v_numeros[i];
    v_ped := null;
    select p.* into v_ped
    from public.numeros_rifa nr
    join public.pedidos_rifa p on p.id = nr.pedido_id
    where nr.rifa_id = v_r.id and nr.numero = v_numero and nr.status = 'pago';

    v_item := jsonb_build_object(
      'ordem', i, 'premio', v_premios[i], 'numero', v_numero,
      'ganhador_nome', v_ped.nome, 'ganhador_phone', v_ped.phone,
      'sem_ganhador', v_ped.id is null
    );
    v_resultado := v_resultado || jsonb_build_array(v_item);
  end loop;

  with nao_pagos as (
    select nr.numero, p.nome, p.phone,
           case when p.origem = 'manual' and p.expira_em is null then 'fixo' else 'reserva' end as origem
    from public.numeros_rifa nr
    join public.pedidos_rifa p on p.id = nr.pedido_id
    where nr.rifa_id = v_r.id and nr.status = 'reservado'
  ), ins as (
    insert into public.rifa_dividas (tenant_id, rifa_id, numero, nome, phone, valor_centavos, origem, sorteio_em)
    select v_r.tenant_id, v_r.id, np.numero, coalesce(np.nome, 'Sem nome'), np.phone,
           v_r.preco_numero_centavos, np.origem, now()
    from nao_pagos np
    on conflict (rifa_id, numero) do nothing
    returning 1
  )
  select count(*) into v_dividas from ins;

  update public.rifas
  set status = 'sorteada',
      numero_sorteado = v_numeros[1],
      ganhador_nome = v_resultado->0->>'ganhador_nome',
      ganhador_phone = v_resultado->0->>'ganhador_phone',
      resultado_sorteio = v_resultado,
      sorteada_em = now(), updated_at = now()
  where id = v_r.id;

  return jsonb_build_object(
    'ok', true,
    'numero_sorteado', v_numeros[1],
    'ganhador_nome', v_resultado->0->>'ganhador_nome',
    'ganhador_phone', v_resultado->0->>'ganhador_phone',
    'sem_ganhador', (v_resultado->0->>'sem_ganhador')::boolean,
    'dividas_geradas', v_dividas,
    'resultado', v_resultado
  );
end;
$$;

revoke all on function public.rifa_sortear_core(uuid, uuid, integer, integer[]) from public;

create or replace function public.sortear_rifa(
  p_rifa uuid, p_numero_manual integer default null, p_numeros_manuais integer[] default null
) returns jsonb language sql security definer set search_path = '' as $$
  select public.rifa_sortear_core((select auth.uid()), p_rifa, p_numero_manual, p_numeros_manuais);
$$;

revoke all on function public.sortear_rifa(uuid, integer, integer[]) from public;
grant execute on function public.sortear_rifa(uuid, integer, integer[]) to authenticated, service_role;

create or replace function public.rifa_sortear_agente(
  p_tenant_id uuid, p_rifa uuid, p_numero_manual integer default null, p_numeros_manuais integer[] default null
) returns jsonb language sql security definer set search_path = '' as $$
  select public.rifa_sortear_core(p_tenant_id, p_rifa, p_numero_manual, p_numeros_manuais);
$$;

revoke all on function public.rifa_sortear_agente(uuid, uuid, integer, integer[]) from public;
grant execute on function public.rifa_sortear_agente(uuid, uuid, integer, integer[]) to service_role;
;
