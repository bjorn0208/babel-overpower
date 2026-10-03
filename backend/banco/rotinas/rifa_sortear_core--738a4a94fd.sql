CREATE OR REPLACE FUNCTION public.rifa_sortear_core(p_tenant uuid, p_rifa uuid, p_numero_manual integer, p_numeros_manuais integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Tranca de identidade (2026-09-08): não pode viver só no GRANT.
  PERFORM public.tenant_efetivo(p_tenant);
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
      and p.divida_dispensada_em is null  -- dono decidiu não cobrar (10/09)
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
$function$

