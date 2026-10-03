-- ═══════════════════════════════════════════════════════════════════════════
-- Rifas v2 — página viva (plano docs/planejamento/2026-08-17-plano-rifas-v2.md)
-- 1. rifas.galeria_urls (fotos extras do prêmio; capa segue imagem_url)
-- 2. pedidos_rifa.utm (origem de tráfego capturada na página pública)
-- 3. obter_rifa_por_token v2: + galeria_urls, numeros_ocupados (≤1000),
--    ultimas_compras (feed social, nome mascarado, nunca phone)
-- 4. reservar_numeros_rifa_publico: + p_utm (assinatura nova ⇒ drop + create)
-- 5. consultar_meus_numeros_rifa: consulta pública por telefone, sem login
-- ═══════════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.rifas
  add column if not exists galeria_urls jsonb not null default '[]'::jsonb;

alter table public.pedidos_rifa
  add column if not exists utm jsonb;

-- ═══════════════ RPC: vitrine pública v2 ═══════════════

create or replace function public.obter_rifa_por_token(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_r public.rifas%rowtype;
  v_pagos integer;
  v_reservados integer;
  v_ranking jsonb;
  v_cotas jsonb;
  v_branding jsonb;
  v_pix text;
  v_ocupados integer[];
  v_ultimas jsonb;
begin
  select * into v_r from public.rifas
  where chave_publica = p_token and deleted_at is null;
  if not found or v_r.status = 'rascunho' then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_encontrada');
  end if;

  select count(*) filter (where status = 'pago'),
         count(*) filter (where status = 'reservado')
    into v_pagos, v_reservados
  from public.numeros_rifa where rifa_id = v_r.id;

  -- números ocupados (reservados + pagos) só em rifa pequena — grid consciente
  if v_r.total_numeros <= 1000 then
    select array_agg(numero order by numero) into v_ocupados
    from public.numeros_rifa where rifa_id = v_r.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nome', t.nome,
           'phone_mascarado', '•••' || right(t.phone, 4),
           'qtd', t.qtd)), '[]'::jsonb)
    into v_ranking
  from (
    select nome, phone, sum(qtd_numeros)::int as qtd
    from public.pedidos_rifa
    where rifa_id = v_r.id and status = 'pago'
    group by nome, phone
    order by sum(qtd_numeros) desc
    limit 5
  ) t;

  -- feed social: últimas compras vivas, nome mascarado ("Joana S."), nunca phone
  select coalesce(jsonb_agg(jsonb_build_object(
           'nome_mascarado', t.nome_mascarado,
           'qtd', t.qtd_numeros,
           'minutos_atras', t.minutos_atras)), '[]'::jsonb)
    into v_ultimas
  from (
    select
      case when split_part(btrim(nome), ' ', 2) = ''
           then split_part(btrim(nome), ' ', 1)
           else split_part(btrim(nome), ' ', 1) || ' ' || left(split_part(btrim(nome), ' ', 2), 1) || '.'
      end as nome_mascarado,
      qtd_numeros,
      greatest(0, floor(extract(epoch from (now() - created_at)) / 60))::int as minutos_atras
    from public.pedidos_rifa
    where rifa_id = v_r.id and status in ('reservado', 'aguardando_validacao', 'pago')
    order by created_at desc
    limit 5
  ) t;

  -- cotas premiadas públicas: número + prêmio + se já saiu (sem expor pedido)
  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', (c->>'numero')::int,
           'premio', c->>'premio',
           'ganho', (c->>'pedido_ganhador') is not null,
           'ganhador_nome', case when (c->>'pedido_ganhador') is not null then c->>'ganhador_nome' end)),
         '[]'::jsonb)
    into v_cotas
  from jsonb_array_elements(v_r.cotas_premiadas) c;

  select jsonb_build_object('nome', e.nome, 'logo_url', e.logo_url, 'banner_url', e.banner_url)
    into v_branding
  from public.empresas e where e.user_id = v_r.tenant_id
  limit 1;

  select coalesce(rc.chave_pix, p.chave_pix) into v_pix
  from public.profiles p
  left join public.rifas_config_tenant rc on rc.tenant_id = p.id
  where p.id = v_r.tenant_id;

  return jsonb_build_object(
    'ok', true,
    'rifa', jsonb_build_object(
      'titulo', v_r.titulo,
      'descricao', v_r.descricao,
      'imagem_url', v_r.imagem_url,
      'galeria_urls', v_r.galeria_urls,
      'premio_principal', v_r.premio_principal,
      'total_numeros', v_r.total_numeros,
      'preco_numero_centavos', v_r.preco_numero_centavos,
      'promocoes', v_r.promocoes,
      'status', v_r.status,
      'data_sorteio_prevista', v_r.data_sorteio_prevista,
      'metodo_sorteio', v_r.metodo_sorteio,
      'max_numeros_por_pedido', v_r.max_numeros_por_pedido,
      'minutos_reserva', v_r.minutos_reserva
    ),
    'progresso', jsonb_build_object(
      'pagos', coalesce(v_pagos, 0),
      'reservados', coalesce(v_reservados, 0),
      'disponiveis', v_r.total_numeros - coalesce(v_pagos, 0) - coalesce(v_reservados, 0)
    ),
    'numeros_ocupados', case when v_ocupados is null then null else to_jsonb(v_ocupados) end,
    'ultimas_compras', v_ultimas,
    'ranking', v_ranking,
    'cotas_premiadas', v_cotas,
    'resultado', case when v_r.status = 'sorteada' then jsonb_build_object(
      'numero_sorteado', v_r.numero_sorteado,
      'ganhador_nome', v_r.ganhador_nome,
      'sorteada_em', v_r.sorteada_em
    ) end,
    'branding', coalesce(v_branding, '{}'::jsonb),
    'chave_pix', v_pix
  );
end;
$$;

revoke all on function public.obter_rifa_por_token(uuid) from public;
grant execute on function public.obter_rifa_por_token(uuid) to anon, authenticated, service_role;

-- ═══════════════ RPC: reservar v2 (+ p_utm) — assinatura nova ⇒ drop + create ═══════════════

drop function if exists public.reservar_numeros_rifa_publico(uuid, text, text, integer, integer[], uuid, uuid, text);

create or replace function public.reservar_numeros_rifa_publico(
  p_token uuid,
  p_nome text,
  p_phone text,
  p_qtd integer default null,
  p_numeros integer[] default null,
  p_lead_id uuid default null,
  p_conversa_id uuid default null,
  p_origem text default 'link',
  p_utm jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.rifas%rowtype;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
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
  if length(v_phone) < 10 then
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

  -- números escolhidos a dedo: valida faixa e duplicata; qtd vem do array
  if p_numeros is not null and array_length(p_numeros, 1) > 0 then
    select array_agg(distinct n) into v_numeros from unnest(p_numeros) n;
    if exists (select 1 from unnest(v_numeros) n where n < 1 or n > v_r.total_numeros) then
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
    v_qtd, '{}', v_valor, 'reservado', now() + make_interval(mins => v_r.minutos_reserva),
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
        from generate_series(1, v_r.total_numeros) gs
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
        from generate_series(1, v_r.total_numeros) gs
        where not exists (
          select 1 from public.numeros_rifa nr
          where nr.rifa_id = v_r.id and nr.numero = gs
        );
        exit when v_livres = 0;
      end if;
    end loop;
    if v_faltam > 0 then
      raise exception 'NUMEROS_INSUFICIENTES: só restam % números disponíveis',
        (select count(*) from generate_series(1, v_r.total_numeros) gs
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
    'rifa_titulo', v_r.titulo
  );
end;
$$;

revoke all on function public.reservar_numeros_rifa_publico(uuid, text, text, integer, integer[], uuid, uuid, text, jsonb) from public;
grant execute on function public.reservar_numeros_rifa_publico(uuid, text, text, integer, integer[], uuid, uuid, text, jsonb) to anon, authenticated, service_role;

-- ═══════════════ RPC: meus números por telefone (sem login) ═══════════════
-- Devolve status + números + valor dos pedidos daquele phone naquela rifa.
-- NÃO devolve o token do pedido (conhecer o phone de alguém não pode dar
-- poder de anexar comprovante no pedido do outro). Nunca vaza tenant_id.

create or replace function public.consultar_meus_numeros_rifa(p_token uuid, p_phone text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
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
$$;

revoke all on function public.consultar_meus_numeros_rifa(uuid, text) from public;
grant execute on function public.consultar_meus_numeros_rifa(uuid, text) to anon, authenticated, service_role;
;
