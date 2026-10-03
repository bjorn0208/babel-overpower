-- Rifas: números fixos por tipo de sorteio + dívidas por sorteio não pago +
-- horários/tipos de sorteio completos (pedido do Fabrício, 24-25/08/2026).
-- (Conteúdo idêntico ao arquivo 20260825190000_rifas_numeros_fixos_dividas_horarios.sql,
--  testado no espelho local com E2E: ativação reserva fixos → sorteio gera dívidas.)

alter table public.rifas drop constraint if exists rifas_metodo_sorteio_check;
alter table public.rifas add constraint rifas_metodo_sorteio_check
  check (metodo_sorteio in (
    'loteria_federal', 'plataforma',
    'ppt', 'ptm', 'pt_rio', 'ptv', 'ptn', 'corujinha'
  ));

create table if not exists public.rifa_numeros_fixos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  metodo_sorteio text not null,
  numero integer not null check (numero >= 0),
  nome text not null,
  phone text,
  created_at timestamptz not null default now(),
  unique (tenant_id, metodo_sorteio, numero)
);

alter table public.rifa_numeros_fixos enable row level security;

drop policy if exists rifa_numeros_fixos_tenant on public.rifa_numeros_fixos;
create policy rifa_numeros_fixos_tenant on public.rifa_numeros_fixos
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());

create table if not exists public.rifa_dividas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  rifa_id uuid not null references public.rifas(id) on delete cascade,
  numero integer not null,
  nome text not null,
  phone text,
  valor_centavos integer not null check (valor_centavos >= 0),
  origem text not null default 'reserva' check (origem in ('fixo', 'reserva')),
  pago boolean not null default false,
  sorteio_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (rifa_id, numero)
);

create index if not exists idx_rifa_dividas_tenant_aberta
  on public.rifa_dividas (tenant_id, pago, phone);

alter table public.rifa_dividas enable row level security;

drop policy if exists rifa_dividas_tenant on public.rifa_dividas;
create policy rifa_dividas_tenant on public.rifa_dividas
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());

create or replace function public.sincronizar_numeros_fixos_rifa(p_rifa uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
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
$$;

create or replace function public.fn_rifa_ativada_aplica_fixos()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status = 'ativa' and (tg_op = 'INSERT' or old.status is distinct from 'ativa') then
    perform public.sincronizar_numeros_fixos_rifa(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rifa_ativada_aplica_fixos on public.rifas;
create trigger trg_rifa_ativada_aplica_fixos
  after insert or update of status on public.rifas
  for each row execute function public.fn_rifa_ativada_aplica_fixos();

create or replace function public.sortear_rifa(p_rifa uuid, p_numero_manual integer default null::integer, p_numeros_manuais integer[] default null::integer[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
  v_dividas integer := 0;
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

  -- DÍVIDAS (Fabrício 24/08): o sorteio saiu — todo número ainda 'reservado'
  -- (fixo ou reserva comum) não foi pago e vira dívida do comprador no valor
  -- unitário do número. Uma linha por número por rifa (unique protege replay).
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
$function$;
;
