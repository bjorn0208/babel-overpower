-- App Rifas — agregadores de leitura pro agente (Theus, 2026-09-06)
-- Entregam em UMA chamada o que a UI monta com N queries.

create or replace function public.rifa_painel_agente(
  p_tenant_id uuid, p_rifa uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_r public.rifas%rowtype;
  v_min integer;
  v_pagos integer;
  v_reservados integer;
  v_arrecadado bigint;
  v_a_receber bigint;
  v_aguardando integer;
  v_participantes integer;
  v_top jsonb;
  v_fila jsonb;
  v_expirando jsonb;
  v_dividas_qtd integer;
  v_dividas_total bigint;
begin
  if p_tenant_id is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_tenant');
  end if;

  if p_rifa is not null then
    select * into v_r from public.rifas
    where id = p_rifa and tenant_id = p_tenant_id and deleted_at is null;
  else
    select * into v_r from public.rifas
    where tenant_id = p_tenant_id and status = 'ativa' and deleted_at is null
    order by created_at desc limit 1;
  end if;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'rifa_nao_encontrada');
  end if;

  v_min := case when v_r.numeracao_desde_zero then 0 else 1 end;

  select count(*) filter (where status = 'pago'),
         count(*) filter (where status = 'reservado')
    into v_pagos, v_reservados
  from public.numeros_rifa where rifa_id = v_r.id;

  select coalesce(sum(valor_centavos) filter (where status = 'pago'), 0),
         coalesce(sum(valor_centavos) filter (where status in ('reservado', 'aguardando_validacao')), 0),
         count(*) filter (where status = 'aguardando_validacao'),
         count(distinct coalesce(phone, 'nome:' || nome)) filter (where status = 'pago')
    into v_arrecadado, v_a_receber, v_aguardando, v_participantes
  from public.pedidos_rifa where rifa_id = v_r.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pedido_id', id, 'nome', nome, 'phone', phone, 'numeros', numeros,
           'valor_centavos', valor_centavos, 'comprovante_url', comprovante_url,
           'criado_em', created_at) order by created_at), '[]'::jsonb)
    into v_fila
  from (select * from public.pedidos_rifa
        where rifa_id = v_r.id and status = 'aguardando_validacao'
        order by created_at limit 20) q;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pedido_id', id, 'nome', nome, 'phone', phone, 'numeros', numeros,
           'valor_centavos', valor_centavos, 'expira_em', expira_em) order by expira_em), '[]'::jsonb)
    into v_expirando
  from (select * from public.pedidos_rifa
        where rifa_id = v_r.id and status = 'reservado' and expira_em is not null
          and expira_em <= now() + interval '2 hours'
        order by expira_em limit 20) e;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_top from (
    select nome, phone, sum(qtd_numeros) as numeros, sum(valor_centavos) as gasto_centavos
    from public.pedidos_rifa
    where rifa_id = v_r.id and status = 'pago'
    group by nome, phone
    order by sum(qtd_numeros) desc
    limit 5
  ) t;

  select count(*), coalesce(sum(valor_centavos), 0)
    into v_dividas_qtd, v_dividas_total
  from public.rifa_dividas where tenant_id = p_tenant_id and pago = false;

  return jsonb_build_object(
    'ok', true,
    'rifa', jsonb_build_object(
      'id', v_r.id, 'codigo_controle', v_r.codigo_controle, 'titulo', v_r.titulo,
      'premio_principal', v_r.premio_principal, 'premios_extras', v_r.premios_extras,
      'status', v_r.status, 'preco_numero_centavos', v_r.preco_numero_centavos,
      'total_numeros', v_r.total_numeros, 'numero_inicial', v_min,
      'metodo_sorteio', v_r.metodo_sorteio, 'data_sorteio_prevista', v_r.data_sorteio_prevista,
      'aceita_fiado', v_r.aceita_fiado, 'minutos_reserva', v_r.minutos_reserva,
      'max_numeros_por_pedido', v_r.max_numeros_por_pedido,
      'promocoes', v_r.promocoes, 'cotas_premiadas', v_r.cotas_premiadas,
      'chave_publica', v_r.chave_publica,
      'numero_sorteado', v_r.numero_sorteado, 'ganhador_nome', v_r.ganhador_nome,
      'resultado_sorteio', v_r.resultado_sorteio, 'sorteada_em', v_r.sorteada_em),
    'progresso', jsonb_build_object(
      'pagos', v_pagos, 'reservados', v_reservados,
      'disponiveis', v_r.total_numeros - v_pagos - v_reservados,
      'total', v_r.total_numeros,
      'pct_vendido', round(((v_pagos + v_reservados)::numeric / nullif(v_r.total_numeros, 0)) * 100, 1)),
    'financeiro', jsonb_build_object(
      'arrecadado_centavos', v_arrecadado,
      'a_receber_centavos', v_a_receber,
      'participantes_pagantes', v_participantes,
      'ticket_medio_centavos', case when v_participantes > 0 then round(v_arrecadado::numeric / v_participantes) else 0 end),
    'aguardando_validacao', jsonb_build_object('qtd', v_aguardando, 'pedidos', v_fila),
    'reservas_expirando_2h', v_expirando,
    'top_compradores', v_top,
    'dividas_abertas', jsonb_build_object('qtd', v_dividas_qtd, 'total_centavos', v_dividas_total)
  );
end;
$$;

revoke all on function public.rifa_painel_agente(uuid, uuid) from public;
grant execute on function public.rifa_painel_agente(uuid, uuid) to service_role;

create or replace function public.rifa_dossie_agente(
  p_tenant_id uuid, p_phone text default null, p_lead_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_pedidos jsonb;
  v_fixos jsonb;
  v_dividas jsonb;
  v_gasto bigint;
  v_numeros integer;
  v_rifas integer;
  v_divida_total bigint;
begin
  if p_tenant_id is null or (v_phone is null and p_lead_id is null) then
    return jsonb_build_object('ok', false, 'erro', 'informe_phone_ou_lead');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pedido_id', p.id, 'rifa_id', p.rifa_id, 'rifa_titulo', r.titulo,
           'rifa_codigo', r.codigo_controle, 'rifa_status', r.status,
           'nome', p.nome, 'numeros', p.numeros, 'qtd', p.qtd_numeros,
           'valor_centavos', p.valor_centavos, 'status', p.status, 'origem', p.origem,
           'comprovante_url', p.comprovante_url, 'expira_em', p.expira_em,
           'criado_em', p.created_at, 'pago_em', p.pago_em,
           'ganhou', (r.numero_sorteado is not null and r.numero_sorteado = any(p.numeros))
         ) order by p.created_at desc), '[]'::jsonb),
         coalesce(sum(p.valor_centavos) filter (where p.status = 'pago'), 0),
         coalesce(sum(p.qtd_numeros) filter (where p.status in ('pago', 'reservado', 'aguardando_validacao')), 0),
         count(distinct p.rifa_id)
    into v_pedidos, v_gasto, v_numeros, v_rifas
  from public.pedidos_rifa p
  join public.rifas r on r.id = p.rifa_id
  where p.tenant_id = p_tenant_id
    and (
      (p_lead_id is not null and p.lead_id = p_lead_id)
      or (v_phone is not null and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = v_phone)
    );

  select coalesce(jsonb_agg(jsonb_build_object(
           'metodo_sorteio', metodo_sorteio, 'numero', numero, 'nome', nome) order by numero), '[]'::jsonb)
    into v_fixos
  from public.rifa_numeros_fixos
  where tenant_id = p_tenant_id
    and v_phone is not null
    and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone;

  select coalesce(jsonb_agg(jsonb_build_object(
           'divida_id', d.id, 'rifa_titulo', r.titulo, 'numero', d.numero,
           'valor_centavos', d.valor_centavos, 'origem', d.origem, 'pago', d.pago,
           'sorteio_em', d.sorteio_em) order by d.sorteio_em desc), '[]'::jsonb),
         coalesce(sum(d.valor_centavos) filter (where d.pago = false), 0)
    into v_dividas, v_divida_total
  from public.rifa_dividas d
  join public.rifas r on r.id = d.rifa_id
  where d.tenant_id = p_tenant_id
    and v_phone is not null
    and regexp_replace(coalesce(d.phone, ''), '\D', '', 'g') = v_phone;

  return jsonb_build_object(
    'ok', true,
    'phone', v_phone,
    'pedidos', v_pedidos,
    'numeros_fixos', v_fixos,
    'dividas', v_dividas,
    'resumo', jsonb_build_object(
      'total_gasto_centavos', v_gasto,
      'numeros_ativos', v_numeros,
      'rifas_participadas', v_rifas,
      'divida_aberta_centavos', v_divida_total)
  );
end;
$$;

revoke all on function public.rifa_dossie_agente(uuid, text, uuid) from public;
grant execute on function public.rifa_dossie_agente(uuid, text, uuid) to service_role;
;
