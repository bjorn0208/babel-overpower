-- Numeração desde zero (00–99): rifa nova numera 0..total-1; antigas seguem
-- 1..total (renumerar cartela vendida trai comprador). Coluna default FALSE —
-- quem liga é o wizard ao CRIAR. Faixa nas RPCs vira v_min..v_max.
-- Down: drop da coluna + recriar reservar v5 / sortear v2.

ALTER TABLE public.rifas ADD COLUMN IF NOT EXISTS numeracao_desde_zero boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.reservar_numeros_rifa_publico(uuid, text, text, integer, integer[], uuid, uuid, text, jsonb, boolean, boolean);

CREATE OR REPLACE FUNCTION public.reservar_numeros_rifa_publico(p_token uuid, p_nome text, p_phone text, p_qtd integer DEFAULT NULL::integer, p_numeros integer[] DEFAULT NULL::integer[], p_lead_id uuid DEFAULT NULL::uuid, p_conversa_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT 'link'::text, p_utm jsonb DEFAULT NULL::jsonb, p_sem_expiracao boolean DEFAULT false, p_fiado boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r public.rifas%rowtype;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_phone text := public.normalizar_telefone_brasil(p_phone);
  v_fixo boolean := false;
  v_min integer;
  v_max integer;
  v_qtd integer;
  v_numeros integer[];
  v_pedido public.pedidos_rifa%rowtype;
  v_valor integer := 0;
  v_restante integer;
  v_promo record;
  v_faltam integer;
  v_inseridos integer;
  v_livres integer;
  v_ocupados integer[];
  v_pix text;
  v_reservados integer[];
begin
  if v_nome is null then
    return jsonb_build_object('ok', false, 'erro', 'nome_obrigatorio');
  end if;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'erro', 'phone_invalido');
  end if;

  perform public.verificar_limite_taxa_publico(v_phone, 'rifa_reserva', 30);

  select * into v_r from public.rifas
  where chave_publica = p_token and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_encontrada');
  end if;
  if v_r.status <> 'ativa' then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_esta_ativa');
  end if;

  -- faixa da cartela: 0..total-1 (desde zero) ou 1..total (legado)
  v_min := case when v_r.numeracao_desde_zero then 0 else 1 end;
  v_max := v_min + v_r.total_numeros - 1;

  -- Reserva sem prazo: número fixo do dono OU fiado liberado pelo dono na rifa.
  v_fixo := (coalesce(p_sem_expiracao, false) and (select auth.uid()) = v_r.tenant_id)
         or (coalesce(p_fiado, false) and v_r.aceita_fiado);
  if coalesce(p_fiado, false) and not v_r.aceita_fiado then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_aceita_fiado');
  end if;

  -- números escolhidos a dedo: valida faixa e duplicata; qtd vem do array
  if p_numeros is not null and array_length(p_numeros, 1) > 0 then
    select array_agg(distinct n) into v_numeros from unnest(p_numeros) n;
    if exists (select 1 from unnest(v_numeros) n where n < v_min or n > v_max) then
      return jsonb_build_object('ok', false, 'erro', 'numero_fora_da_faixa');
    end if;
    v_qtd := array_length(v_numeros, 1);
  else
    v_qtd := coalesce(p_qtd, 0);
  end if;

  if v_qtd < 1 or v_qtd > v_r.max_numeros_por_pedido then
    return jsonb_build_object('ok', false, 'erro',
      'quantidade_invalida (mín 1, máx ' || v_r.max_numeros_por_pedido || ')');
  end if;

  -- valor: pacotes promocionais gulosos (maior primeiro) + resto no preço unitário
  v_restante := v_qtd;
  for v_promo in
    select (c->>'qtd')::int as q, (c->>'preco_total_centavos')::int as p
    from jsonb_array_elements(v_r.promocoes) c
    where (c->>'qtd')::int > 0 and (c->>'preco_total_centavos')::int > 0
    order by (c->>'qtd')::int desc
  loop
    while v_restante >= v_promo.q loop
      v_valor := v_valor + v_promo.p;
      v_restante := v_restante - v_promo.q;
    end loop;
  end loop;
  v_valor := v_valor + v_restante * v_r.preco_numero_centavos;

  insert into public.pedidos_rifa (
    rifa_id, tenant_id, nome, phone, lead_id, conversa_id, origem,
    qtd_numeros, numeros, valor_centavos, status, expira_em, utm
  ) values (
    v_r.id, v_r.tenant_id, v_nome, v_phone, p_lead_id, p_conversa_id,
    case when p_origem in ('link','agente','manual') then p_origem else 'link' end,
    v_qtd, '{}', v_valor, 'reservado',
    case when v_fixo then null else now() + make_interval(mins => v_r.minutos_reserva) end,
    p_utm
  ) returning * into v_pedido;

  if v_numeros is not null then
    -- manual: tudo-ou-nada
    insert into public.numeros_rifa (rifa_id, tenant_id, pedido_id, numero, status)
    select v_r.id, v_r.tenant_id, v_pedido.id, n, 'reservado' from unnest(v_numeros) n
    on conflict (rifa_id, numero) do nothing;
    get diagnostics v_inseridos = row_count;
    if v_inseridos < v_qtd then
      select array_agg(n order by n) into v_ocupados
      from unnest(v_numeros) n
      where not exists (
        select 1 from public.numeros_rifa nr
        where nr.rifa_id = v_r.id and nr.numero = n and nr.pedido_id = v_pedido.id
      );
      raise exception 'NUMEROS_OCUPADOS:%', array_to_string(v_ocupados, ',');
    end if;
  else
    -- aleatório: loop curto com re-sorteio dos que colidirem
    v_faltam := v_qtd;
    for i in 1..6 loop
      exit when v_faltam <= 0;
      with candidatos as (
        select gs as numero
        from generate_series(v_min, v_max) gs
        where not exists (
          select 1 from public.numeros_rifa nr
          where nr.rifa_id = v_r.id and nr.numero = gs
        )
        order by random()
        limit v_faltam
      ), ins as (
        insert into public.numeros_rifa (rifa_id, tenant_id, pedido_id, numero, status)
        select v_r.id, v_r.tenant_id, v_pedido.id, numero, 'reservado' from candidatos
        on conflict (rifa_id, numero) do nothing
        returning numero
      )
      select count(*) into v_inseridos from ins;
      v_faltam := v_faltam - v_inseridos;
      if v_inseridos = 0 then
        select count(*) into v_livres
        from generate_series(v_min, v_max) gs
        where not exists (
          select 1 from public.numeros_rifa nr
          where nr.rifa_id = v_r.id and nr.numero = gs
        );
        exit when v_livres = 0;
      end if;
    end loop;
    if v_faltam > 0 then
      raise exception 'NUMEROS_INSUFICIENTES: só restam % números disponíveis',
        (select count(*) from generate_series(v_min, v_max) gs
         where not exists (select 1 from public.numeros_rifa nr
                           where nr.rifa_id = v_r.id and nr.numero = gs));
    end if;
  end if;

  select array_agg(numero order by numero) into v_reservados
  from public.numeros_rifa where pedido_id = v_pedido.id;

  update public.pedidos_rifa set numeros = v_reservados, updated_at = now()
  where id = v_pedido.id;

  select coalesce(rc.chave_pix, p.chave_pix) into v_pix
  from public.profiles p
  left join public.rifas_config_tenant rc on rc.tenant_id = p.id
  where p.id = v_r.tenant_id;

  return jsonb_build_object(
    'ok', true,
    'pedido_token', v_pedido.chave_publica,
    'numeros', to_jsonb(v_reservados),
    'qtd', v_qtd,
    'valor_centavos', v_valor,
    'chave_pix', v_pix,
    'expira_em', v_pedido.expira_em,
    'numero_fixo', v_fixo,
    'rifa_titulo', v_r.titulo
  );
end;
$function$;

-- sortear_rifa v3: validações de faixa respeitam desde-zero.
CREATE OR REPLACE FUNCTION public.sortear_rifa(p_rifa uuid, p_numero_manual integer DEFAULT NULL::integer, p_numeros_manuais integer[] DEFAULT NULL::integer[])
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
  v_premios text[];
  v_numeros integer[];
  v_qtd integer;
  v_numero integer;
  v_ped public.pedidos_rifa%rowtype;
  v_resultado jsonb := '[]'::jsonb;
  v_item jsonb;
  i integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;

  select * into v_r from public.rifas
  where id = p_rifa and tenant_id = v_uid and deleted_at is null
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
      'ordem', i,
      'premio', v_premios[i],
      'numero', v_numero,
      'ganhador_nome', v_ped.nome,
      'ganhador_phone', v_ped.phone,
      'sem_ganhador', v_ped.id is null
    );
    v_resultado := v_resultado || jsonb_build_array(v_item);
  end loop;

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
    'resultado', v_resultado
  );
end;
$function$;
;
