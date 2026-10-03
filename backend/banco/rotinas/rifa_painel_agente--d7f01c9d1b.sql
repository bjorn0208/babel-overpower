CREATE OR REPLACE FUNCTION public.rifa_painel_agente(p_tenant_id uuid, p_rifa uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Tranca de identidade (2026-09-08): não pode viver só no GRANT.
  PERFORM public.tenant_efetivo(p_tenant_id);
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
    -- Δ 2026-09-11 (Fabrício): o mesmo telefone é o mesmo comprador — agrupa por phone (o nome
    -- exibido é o mais recente não-genérico); sem telefone, cai no nome.
    select
      coalesce(
        (select p2.nome from public.pedidos_rifa p2
          where p2.rifa_id = v_r.id and p2.status = 'pago'
            and coalesce(p2.phone, 'nome:' || p2.nome) = coalesce(p.phone, 'nome:' || p.nome)
            and p2.nome !~* '^(lead|cliente whatsapp|cliente|contato)?$' and p2.nome !~ '^[0-9]{8,}$'
          order by p2.created_at desc limit 1),
        max(p.nome)) as nome,
      p.phone,
      sum(p.qtd_numeros) as numeros,
      sum(p.valor_centavos) as gasto_centavos
    from public.pedidos_rifa p
    where p.rifa_id = v_r.id and p.status = 'pago'
    group by coalesce(p.phone, 'nome:' || p.nome), p.phone
    order by sum(p.qtd_numeros) desc
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
$function$

