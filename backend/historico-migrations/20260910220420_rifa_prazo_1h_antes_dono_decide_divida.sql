-- Rifas (pedido do Fabrício, 10/09/2026): quem reserva pode pagar até 1h antes do sorteio.
-- Passou do prazo sem pagar, o DONO decide se vira dívida ou não — nada automático.
-- Antes: prazo = agora + minutos_reserva, e a cron rifa_reservas_viram_divida transformava
-- a reserva em dívida sozinha 1h antes do sorteio.

-- 1. Decisão do dono no pedido
alter table public.pedidos_rifa
  add column if not exists aviso_dono_em timestamptz,
  add column if not exists divida_dispensada_em timestamptz;

comment on column public.pedidos_rifa.aviso_dono_em is
  'Quando o dono foi avisado (sino do app) de que esta reserva passou do prazo sem pagamento.';
comment on column public.pedidos_rifa.divida_dispensada_em is
  'O dono decidiu NÃO cobrar esta reserva vencida: o sorteio não gera dívida dela. O número continua reservado no nome da pessoa.';

-- 2. Hora padrão do método. Espelho de PADRAO_METODO em supabase/functions/_shared/tools-rifas.ts —
--    mudou lá, muda aqui (JS getDay: 0=dom; aqui isodow: 7=dom).
create or replace function public.rifa_hora_padrao_metodo(p_metodo text, p_data date)
returns time
language sql
immutable
set search_path to ''
as $$
  select case
    when p_metodo = 'loteria_federal' then
      case extract(isodow from p_data)::int when 7 then time '11:00' when 3 then time '20:00' end
    when extract(isodow from p_data)::int between 1 and 6 then
      case p_metodo
        when 'ppt' then time '09:20'
        when 'ptm' then time '11:20'
        when 'pt_rio' then time '14:20'
        when 'ptv' then time '16:20'
        when 'ptn' then time '18:20'
        when 'corujinha' then time '21:20'
      end
  end
$$;

-- 3. "19h" · "19:30" · "19h30" · "7" → time. Espelho de normalizarHora (tools-rifas.ts).
create or replace function public.rifa_normalizar_hora(p_txt text)
returns time
language plpgsql
immutable
set search_path to ''
as $$
declare
  m text[];
  h integer;
  mi integer;
begin
  if p_txt is null then return null; end if;
  m := regexp_match(btrim(p_txt), '^(\d{1,2})\s*[:hH]?\s*(\d{2})?');
  if m is null then return null; end if;
  h := m[1]::int;
  mi := coalesce(m[2], '0')::int;
  if h > 23 or mi > 59 then return null; end if;
  return make_time(h, mi, 0);
end;
$$;

-- 4. Momento do sorteio na mesma ordem que a agente usa (resolverSorteio): hora da rifa →
--    hora da arte mais recente → padrão do método → 20:00 (legado). Sem data → null.
create or replace function public.rifa_sorteio_em(p_rifa uuid)
returns timestamptz
language sql
stable
security definer
set search_path to ''
as $$
  select case when r.data_sorteio_prevista is null then null else
    (r.data_sorteio_prevista + coalesce(
      r.hora_sorteio,
      (select public.rifa_normalizar_hora(ri.hora_sorteio)
         from public.rifa_imagens ri
        where ri.rifa_id = r.id and ri.deleted_at is null and ri.hora_sorteio is not null
        order by ri.created_at desc
        limit 1),
      public.rifa_hora_padrao_metodo(r.metodo_sorteio, r.data_sorteio_prevista),
      time '20:00'
    )) at time zone 'America/Sao_Paulo'
  end
  from public.rifas r
  where r.id = p_rifa
$$;

-- 5. Prazo de pagamento da reserva = 1h antes do sorteio (null quando a rifa não tem data).
create or replace function public.rifa_prazo_pagamento(p_rifa uuid)
returns timestamptz
language sql
stable
security definer
set search_path to ''
as $$
  select public.rifa_sorteio_em(p_rifa) - interval '1 hour'
$$;

revoke all on function public.rifa_sorteio_em(uuid) from public, anon, authenticated;
revoke all on function public.rifa_prazo_pagamento(uuid) from public, anon, authenticated;
grant execute on function public.rifa_sorteio_em(uuid) to service_role;
grant execute on function public.rifa_prazo_pagamento(uuid) to service_role;

-- 6. A reserva passa a valer até o prazo. Troca SÓ as duas expressões de prazo da função
--    (reserva nova e "juntar no mesmo pedido") e confere que eram exatamente duas.
--    Rifa sem data continua com agora + minutos_reserva.
do $migra$
declare
  d text;
  alvo text := 'now() + make_interval(mins => v_r.minutos_reserva)';
  n integer;
begin
  d := pg_get_functiondef('public.reservar_numeros_rifa_publico(uuid,text,text,integer,integer[],uuid,uuid,text,jsonb,boolean,boolean,uuid)'::regprocedure);
  n := (length(d) - length(replace(d, alvo, ''))) / length(alvo);
  if n <> 2 then
    raise exception 'reservar_numeros_rifa_publico: esperava 2 expressões de prazo, achei %', n;
  end if;
  execute replace(d, alvo, 'coalesce(public.rifa_prazo_pagamento(v_r.id), ' || alvo || ')');
end;
$migra$;

-- 7. Sorteio não gera dívida de reserva que o dono decidiu não cobrar.
do $migra$
declare
  d text;
  alvo text := E'where nr.rifa_id = v_r.id and nr.status = ''reservado''\n  ), ins as (';
  n integer;
begin
  d := pg_get_functiondef('public.rifa_sortear_core(uuid,uuid,integer,integer[])'::regprocedure);
  n := (length(d) - length(replace(d, alvo, ''))) / length(alvo);
  if n <> 1 then
    raise exception 'rifa_sortear_core: esperava 1 filtro de números não pagos, achei %', n;
  end if;
  execute replace(d, alvo,
    E'where nr.rifa_id = v_r.id and nr.status = ''reservado''\n      and p.divida_dispensada_em is null  -- dono decidiu não cobrar (10/09)\n  ), ins as (');
end;
$migra$;

-- 8. Acabou a dívida automática 1h antes do sorteio.
select cron.unschedule('rifa_reservas_viram_divida');

-- 9. Aviso no sino do dono quando a reserva passa do prazo sem pagamento (uma vez por pedido).
create or replace function public.avisar_dono_reservas_vencidas()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_qtd integer := 0;
  v_g record;
begin
  for v_g in
    select pr.tenant_id, pr.rifa_id, r.titulo,
           array_agg(pr.id) as ids,
           count(*) as n,
           string_agg(
             coalesce(pr.nome, 'Sem nome') || ' (' || array_to_string(pr.numeros, ', ') || ') R$ ' ||
             replace(to_char(pr.valor_centavos / 100.0, 'FM999999990D00'), '.', ','),
             ' · ' order by pr.created_at) as lista
    from public.pedidos_rifa pr
    join public.rifas r on r.id = pr.rifa_id
    where pr.status = 'reservado'
      and pr.expira_em is not null
      and pr.expira_em < now()
      and pr.aviso_dono_em is null
      and pr.divida_gerada_em is null
      and pr.divida_dispensada_em is null
      and r.status = 'ativa'
      and r.deleted_at is null
    group by pr.tenant_id, pr.rifa_id, r.titulo
  loop
    insert into public.notificacoes (user_id, tipo, icone, titulo, mensagem, acao, acao_label)
    values (
      v_g.tenant_id, 'aviso', 'rifa',
      'Reservas sem pagamento — ' || v_g.titulo,
      v_g.n || ' reserva(s) passaram do prazo de pagamento sem pagar: ' || v_g.lista ||
        '. Em Rifas > Pedidos, escolha "Mandar pra dívida" ou "Não cobrar". Se não decidir, ' ||
        'o sorteio lança como dívida, como sempre.',
      'rifas', 'Abrir Rifas'
    );
    update public.pedidos_rifa set aviso_dono_em = now() where id = any(v_g.ids);
    v_qtd := v_qtd + v_g.n;
  end loop;
  return v_qtd;
end;
$$;

revoke all on function public.avisar_dono_reservas_vencidas() from public, anon, authenticated;

select cron.schedule('avisar_dono_reservas_vencidas', '*/10 * * * *',
  'select public.avisar_dono_reservas_vencidas()');

-- 10. Decisão do dono sobre uma reserva vencida: 'divida' ou 'sem_divida'.
create or replace function public.rifa_decidir_reserva_vencida(p_pedido uuid, p_decisao text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
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
$$;

revoke all on function public.rifa_decidir_reserva_vencida(uuid, text) from public, anon;
grant execute on function public.rifa_decidir_reserva_vencida(uuid, text) to authenticated, service_role;

-- 11. Lembrete ao comprador (10 min antes do prazo) sem prometer que o número volta pro sorteio.
create or replace function public.avisar_reservas_rifa_a_vencer()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_qtd integer := 0;
  v_p record;
  v_texto text;
begin
  for v_p in
    select pr.id, pr.tenant_id, pr.conversa_id, pr.numeros, pr.valor_centavos, pr.expira_em,
           r.titulo, r.data_sorteio_prevista, coalesce(rc.chave_pix, pf.chave_pix) as chave_pix
    from public.pedidos_rifa pr
    join public.rifas r on r.id = pr.rifa_id
    join public.conversas c on c.id = pr.conversa_id
    left join public.profiles pf on pf.id = pr.tenant_id
    left join public.rifas_config_tenant rc on rc.tenant_id = pr.tenant_id
    where pr.status = 'reservado'
      and pr.aviso_expiracao_em is null
      and pr.conversa_id is not null
      and pr.expira_em is not null
      and pr.expira_em > now()
      and pr.expira_em <= now() + interval '10 minutes'
      and c.status <> 'encerrada'
      and coalesce(c.channel, '') <> 'teste'
    limit 50
  loop
    v_texto :=
      'Oi! Passando pra lembrar: seus números da rifa "' || v_p.titulo || '" (' ||
      array_to_string(v_p.numeros, ', ') || ') estão reservados, e o pagamento vai até as ' ||
      to_char(v_p.expira_em at time zone 'America/Sao_Paulo', 'HH24:MI') ||
      case when v_p.data_sorteio_prevista is not null then ' (1h antes do sorteio)' else '' end ||
      '. Valor: R$ ' ||
      replace(to_char(v_p.valor_centavos / 100.0, 'FM999999990D00'), '.', ',') ||
      case when v_p.chave_pix is not null then ' — PIX: ' || v_p.chave_pix else '' end ||
      '. Assim que pagar, é só mandar o comprovante aqui na conversa que eu confirmo 😉';

    insert into public.caixa_saida_mensagens
      (tenant_id, conversation_id, status, content, bubble_order, scheduled_at, carga)
    values
      (v_p.tenant_id, v_p.conversa_id, 'pendente', v_texto, 0, now(),
       jsonb_build_object('origem', 'cron_aviso_reserva_rifa', 'pedido_id', v_p.id));

    update public.pedidos_rifa set aviso_expiracao_em = now(), updated_at = now()
    where id = v_p.id;
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$function$;

-- 12. Reservas abertas hoje (com prazo) passam pro prazo novo.
update public.pedidos_rifa pr
set expira_em = public.rifa_prazo_pagamento(pr.rifa_id), updated_at = now()
where pr.status = 'reservado'
  and pr.expira_em is not null
  and pr.divida_gerada_em is null
  and public.rifa_prazo_pagamento(pr.rifa_id) is not null;
;
