-- App Rifas Sorteio — Tijolo 1 (banco)
-- Rifa com números on-demand: só existe row em numeros_rifa quando alguém reserva.
-- UNIQUE (rifa_id, numero) é a trava anti-venda-dupla. Pagamento = PIX manual +
-- comprovante + validação do dono (padrão da casa). Link público por chave_publica
-- via RPC SECURITY DEFINER (molde App Consulta / estrutura/funcoes/publico-anonimo.md).

-- ══════════════════════════════════ TABELAS ══════════════════════════════════

create table if not exists public.rifas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  descricao text,
  imagem_url text,
  premio_principal text not null,
  total_numeros integer not null check (total_numeros between 1 and 100000),
  preco_numero_centavos integer not null check (preco_numero_centavos > 0),
  promocoes jsonb not null default '[]'::jsonb,           -- [{qtd, preco_total_centavos}]
  cotas_premiadas jsonb not null default '[]'::jsonb,     -- [{numero, premio, pedido_ganhador, ganhador_nome}]
  status text not null default 'rascunho' check (status in ('rascunho','ativa','pausada','encerrada','sorteada')),
  chave_publica uuid not null unique default gen_random_uuid(),
  data_sorteio_prevista date,
  metodo_sorteio text not null default 'loteria_federal' check (metodo_sorteio in ('loteria_federal','plataforma')),
  numero_sorteado integer,
  ganhador_nome text,
  ganhador_phone text,
  sorteada_em timestamptz,
  minutos_reserva integer not null default 30 check (minutos_reserva between 5 and 1440),
  max_numeros_por_pedido integer not null default 100 check (max_numeros_por_pedido between 1 and 1000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rifas_tenant_idx on public.rifas (tenant_id) where deleted_at is null;

create table if not exists public.pedidos_rifa (
  id uuid primary key default gen_random_uuid(),
  rifa_id uuid not null references public.rifas(id) on delete cascade,
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  chave_publica uuid not null unique default gen_random_uuid(),
  nome text not null,
  phone text not null,
  lead_id uuid references public.leads(id) on delete set null,
  conversa_id uuid references public.conversas(id) on delete set null,
  origem text not null default 'link' check (origem in ('link','agente','manual')),
  qtd_numeros integer not null check (qtd_numeros > 0),
  numeros integer[] not null,
  valor_centavos integer not null check (valor_centavos >= 0),
  status text not null default 'reservado' check (status in ('reservado','aguardando_validacao','pago','expirado','cancelado','rejeitado')),
  comprovante_url text,
  motivo_rejeicao text,
  expira_em timestamptz,
  pago_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pedidos_rifa_rifa_idx on public.pedidos_rifa (rifa_id);
create index if not exists pedidos_rifa_tenant_idx on public.pedidos_rifa (tenant_id);
create index if not exists pedidos_rifa_lead_idx on public.pedidos_rifa (lead_id);
create index if not exists pedidos_rifa_conversa_idx on public.pedidos_rifa (conversa_id);
-- índice cirúrgico do cron de expiração
create index if not exists pedidos_rifa_expiracao_idx on public.pedidos_rifa (expira_em) where status = 'reservado';

create table if not exists public.numeros_rifa (
  id uuid primary key default gen_random_uuid(),
  rifa_id uuid not null references public.rifas(id) on delete cascade,
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  pedido_id uuid not null references public.pedidos_rifa(id) on delete cascade,
  numero integer not null check (numero >= 1),
  status text not null default 'reservado' check (status in ('reservado','pago')),
  created_at timestamptz not null default now(),
  unique (rifa_id, numero)                                -- trava anti-venda-dupla
);

create index if not exists numeros_rifa_pedido_idx on public.numeros_rifa (pedido_id);
create index if not exists numeros_rifa_tenant_idx on public.numeros_rifa (tenant_id);

create table if not exists public.rifas_config_tenant (
  tenant_id uuid primary key references public.profiles(id) on delete cascade,
  agente_pode_vender boolean not null default true,
  chave_pix text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ══════════════════════════════════ RLS ══════════════════════════════════════
-- Público NUNCA toca as tabelas direto — só via RPC DEFINER. Policies são do dono.

alter table public.rifas enable row level security;
alter table public.pedidos_rifa enable row level security;
alter table public.numeros_rifa enable row level security;
alter table public.rifas_config_tenant enable row level security;

drop policy if exists rifas_tenant_all on public.rifas;
create policy rifas_tenant_all on public.rifas
  for all to authenticated
  using (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

drop policy if exists pedidos_rifa_tenant_all on public.pedidos_rifa;
create policy pedidos_rifa_tenant_all on public.pedidos_rifa
  for all to authenticated
  using (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

drop policy if exists numeros_rifa_tenant_all on public.numeros_rifa;
create policy numeros_rifa_tenant_all on public.numeros_rifa
  for all to authenticated
  using (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

drop policy if exists rifas_config_tenant_all on public.rifas_config_tenant;
create policy rifas_config_tenant_all on public.rifas_config_tenant
  for all to authenticated
  using (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

-- ══════════════════════════════ RPC: catraca ═════════════════════════════════
-- Molde consulta_pode_vender SEM portão de saldo (rifa não tem custo por uso).
-- Sem row de config = liberado (instalar o app já é o opt-in; toggle desliga).

create or replace function public.rifa_pode_vender(p_tenant_id uuid default null)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := coalesce(p_tenant_id, (select auth.uid()));
  v_exige_instalacao boolean;
  v_instalado boolean;
  v_toggle boolean;
begin
  if v_tenant is null then return false; end if;

  select exists (
    select 1 from public.loja_aplicativos where slug = 'rifas' and is_active = true
  ) into v_exige_instalacao;

  if v_exige_instalacao then
    select exists (
      select 1 from public.aplicativos_instalados
      where user_id = v_tenant and aplicativo_slug = 'rifas'
    ) into v_instalado;
    if not v_instalado then return false; end if;
  end if;

  select agente_pode_vender into v_toggle
  from public.rifas_config_tenant where tenant_id = v_tenant;

  return coalesce(v_toggle, true);
end;
$$;

revoke all on function public.rifa_pode_vender(uuid) from public;
grant execute on function public.rifa_pode_vender(uuid) to authenticated, service_role;

-- ═══════════════════════ RPC: vitrine pública da rifa ════════════════════════

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

-- ═══════════════ RPC: reservar números (fonte única: link + agente) ══════════
-- Aleatório: candidatos livres + INSERT ON CONFLICT DO NOTHING em loop curto —
-- corrida entre dois compradores só refaz o sorteio dos números que colidiram.
-- Escolha manual: tudo-ou-nada (qualquer número ocupado = exception = rollback).

create or replace function public.reservar_numeros_rifa_publico(
  p_token uuid,
  p_nome text,
  p_phone text,
  p_qtd integer default null,
  p_numeros integer[] default null,
  p_lead_id uuid default null,
  p_conversa_id uuid default null,
  p_origem text default 'link'
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
    qtd_numeros, numeros, valor_centavos, status, expira_em
  ) values (
    v_r.id, v_r.tenant_id, v_nome, v_phone, p_lead_id, p_conversa_id,
    case when p_origem in ('link','agente','manual') then p_origem else 'link' end,
    v_qtd, '{}', v_valor, 'reservado', now() + make_interval(mins => v_r.minutos_reserva)
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

revoke all on function public.reservar_numeros_rifa_publico(uuid, text, text, integer, integer[], uuid, uuid, text) from public;
grant execute on function public.reservar_numeros_rifa_publico(uuid, text, text, integer, integer[], uuid, uuid, text) to anon, authenticated, service_role;

-- ══════════════════ RPC: acompanhar pedido + enviar comprovante ══════════════

create or replace function public.obter_pedido_rifa_por_token(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_p public.pedidos_rifa%rowtype;
  v_titulo text;
  v_pix text;
begin
  select * into v_p from public.pedidos_rifa where chave_publica = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado');
  end if;

  select titulo into v_titulo from public.rifas where id = v_p.rifa_id;
  select coalesce(rc.chave_pix, pr.chave_pix) into v_pix
  from public.profiles pr
  left join public.rifas_config_tenant rc on rc.tenant_id = pr.id
  where pr.id = v_p.tenant_id;

  return jsonb_build_object(
    'ok', true,
    'rifa_titulo', v_titulo,
    'nome', v_p.nome,
    'numeros', to_jsonb(v_p.numeros),
    'qtd', v_p.qtd_numeros,
    'valor_centavos', v_p.valor_centavos,
    'status', v_p.status,
    'comprovante_url', v_p.comprovante_url,
    'motivo_rejeicao', v_p.motivo_rejeicao,
    'expira_em', v_p.expira_em,
    'pago_em', v_p.pago_em,
    'chave_pix', v_pix
  );
end;
$$;

revoke all on function public.obter_pedido_rifa_por_token(uuid) from public;
grant execute on function public.obter_pedido_rifa_por_token(uuid) to anon, authenticated, service_role;

create or replace function public.enviar_comprovante_rifa_publico(p_token uuid, p_url text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_p public.pedidos_rifa%rowtype;
begin
  if nullif(btrim(coalesce(p_url, '')), '') is null then
    return jsonb_build_object('ok', false, 'erro', 'url_obrigatoria');
  end if;

  perform public.verificar_limite_taxa_publico(p_token::text, 'rifa_comprovante', 10);

  select * into v_p from public.pedidos_rifa where chave_publica = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado');
  end if;
  if v_p.status not in ('reservado', 'aguardando_validacao', 'rejeitado') then
    return jsonb_build_object('ok', false, 'erro', 'pedido_nao_aceita_comprovante');
  end if;

  -- comprovante anexado tira o pedido da mira do cron de expiração
  update public.pedidos_rifa
  set comprovante_url = p_url, status = 'aguardando_validacao',
      motivo_rejeicao = null, expira_em = null, updated_at = now()
  where id = v_p.id;

  return jsonb_build_object('ok', true, 'status', 'aguardando_validacao');
end;
$$;

revoke all on function public.enviar_comprovante_rifa_publico(uuid, text) from public;
grant execute on function public.enviar_comprovante_rifa_publico(uuid, text) to anon, authenticated, service_role;

-- ══════════════ RPC: dono valida pagamento (molde aprovar_recarga) ═══════════

create or replace function public.confirmar_pagamento_pedido_rifa(
  p_pedido uuid,
  p_aprovar boolean,
  p_motivo text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_p public.pedidos_rifa%rowtype;
  v_cotas_ganhas jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;

  select * into v_p from public.pedidos_rifa
  where id = p_pedido and tenant_id = v_uid
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

    -- cotas premiadas: número pago bate cota sem ganhador → marca
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

revoke all on function public.confirmar_pagamento_pedido_rifa(uuid, boolean, text) from public;
grant execute on function public.confirmar_pagamento_pedido_rifa(uuid, boolean, text) to authenticated, service_role;

-- ══════════════════════════════ RPC: sorteio ═════════════════════════════════

create or replace function public.sortear_rifa(p_rifa uuid, p_numero_manual integer default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_r public.rifas%rowtype;
  v_numero integer;
  v_ped public.pedidos_rifa%rowtype;
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

  if p_numero_manual is not null then
    -- resultado externo (Loteria Federal): registra mesmo sem dono do número
    if p_numero_manual < 1 or p_numero_manual > v_r.total_numeros then
      return jsonb_build_object('ok', false, 'erro', 'numero_fora_da_faixa');
    end if;
    v_numero := p_numero_manual;
  else
    -- sorteio da plataforma: aleatório entre números PAGOS (garante ganhador)
    select numero into v_numero from public.numeros_rifa
    where rifa_id = v_r.id and status = 'pago'
    order by random() limit 1;
    if v_numero is null then
      return jsonb_build_object('ok', false, 'erro', 'sem_numeros_pagos');
    end if;
  end if;

  select p.* into v_ped
  from public.numeros_rifa nr
  join public.pedidos_rifa p on p.id = nr.pedido_id
  where nr.rifa_id = v_r.id and nr.numero = v_numero and nr.status = 'pago';

  update public.rifas
  set status = 'sorteada', numero_sorteado = v_numero,
      ganhador_nome = v_ped.nome, ganhador_phone = v_ped.phone,
      sorteada_em = now(), updated_at = now()
  where id = v_r.id;

  return jsonb_build_object(
    'ok', true,
    'numero_sorteado', v_numero,
    'ganhador_nome', v_ped.nome,
    'ganhador_phone', v_ped.phone,
    'sem_ganhador', v_ped.id is null
  );
end;
$$;

revoke all on function public.sortear_rifa(uuid, integer) from public;
grant execute on function public.sortear_rifa(uuid, integer) to authenticated, service_role;

-- ═══════════════════════ RPC + cron: expirar reservas ════════════════════════

create or replace function public.expirar_reservas_rifa()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_qtd integer;
begin
  with vencidos as (
    select id from public.pedidos_rifa
    where status = 'reservado' and expira_em is not null and expira_em < now()
  ), del as (
    delete from public.numeros_rifa
    where pedido_id in (select id from vencidos)
  )
  update public.pedidos_rifa
  set status = 'expirado', updated_at = now()
  where id in (select id from vencidos);
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

revoke all on function public.expirar_reservas_rifa() from public;
grant execute on function public.expirar_reservas_rifa() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expirar_reservas_rifa') then
    perform cron.unschedule('expirar_reservas_rifa');
  end if;
  perform cron.schedule('expirar_reservas_rifa', '*/5 * * * *', 'select public.expirar_reservas_rifa()');
end;
$$;

-- ═══════════════ storage: bucket público de comprovantes da rifa ═════════════
-- Molde consultas-anexos: upload anon + leitura pública (URL é o segredo).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rifas-anexos', 'rifas-anexos', true, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policy where polname = 'rifas_anon_upload' and polrelid = 'storage.objects'::regclass) then
    create policy rifas_anon_upload on storage.objects
      for insert to anon with check (bucket_id = 'rifas-anexos');
  end if;
  if not exists (select 1 from pg_policy where polname = 'rifas_authenticated_upload' and polrelid = 'storage.objects'::regclass) then
    create policy rifas_authenticated_upload on storage.objects
      for insert to authenticated with check (bucket_id = 'rifas-anexos');
  end if;
  if not exists (select 1 from pg_policy where polname = 'rifas_leitura_publica_anexos' and polrelid = 'storage.objects'::regclass) then
    create policy rifas_leitura_publica_anexos on storage.objects
      for select to anon, authenticated using (bucket_id = 'rifas-anexos');
  end if;
end;
$$;

-- ═══════════════════ seed: app Rifas no catálogo da Loja ═════════════════════
-- A partir desta row o app só aparece no OS depois de instalado pela Loja.

insert into public.loja_aplicativos (slug, nome, descricao, icone, categoria, preco_mensal, is_active, ordem)
select 'rifas', 'Rifas',
       'Crie rifas com números, link público de compra e venda pelo agente no WhatsApp. Cotas premiadas, ranking de compradores e sorteio.',
       'app:rifas', 'marketing', null, true, 14
where not exists (select 1 from public.loja_aplicativos where slug = 'rifas');
;
