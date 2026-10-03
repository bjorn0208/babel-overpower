CREATE OR REPLACE FUNCTION public.obter_rifa_por_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r public.rifas%rowtype;
  v_pagos integer;
  v_reservados integer;
  v_ranking jsonb;
  v_cotas jsonb;
  v_branding jsonb;
  v_pix text;
  v_ocupados integer[];
  v_numeros_pagos integer[];
  v_numeros_com_nome jsonb;
  v_ultimas jsonb;
  v_resultado_publico jsonb;
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

  if v_r.total_numeros <= 1000 then
    select array_agg(numero order by numero) into v_ocupados
    from public.numeros_rifa where rifa_id = v_r.id;

    select array_agg(numero order by numero) into v_numeros_pagos
    from public.numeros_rifa where rifa_id = v_r.id and status = 'pago';

    select coalesce(jsonb_agg(jsonb_build_object(
             'numero', nr.numero,
             'status', nr.status,
             'nome', pr.nome,
             'phone_mascarado', coalesce('•••' || right(pr.phone, 4), 'sem telefone')
           ) order by nr.numero), '[]'::jsonb)
      into v_numeros_com_nome
      from public.numeros_rifa nr
      join public.pedidos_rifa pr on pr.id = nr.pedido_id
      where nr.rifa_id = v_r.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nome', t.nome,
           'phone_mascarado', coalesce('•••' || right(t.phone, 4), 'sem telefone'),
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

  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', (c->>'numero')::int,
           'premio', c->>'premio',
           'ganho', (c->>'pedido_ganhador') is not null,
           'ganhador_nome', case when (c->>'pedido_ganhador') is not null then c->>'ganhador_nome' end)),
         '[]'::jsonb)
    into v_cotas
  from jsonb_array_elements(v_r.cotas_premiadas) c;

  if v_r.resultado_sorteio is not null then
    select jsonb_agg(jsonb_build_object(
             'ordem', (c->>'ordem')::int,
             'premio', c->>'premio',
             'numero', (c->>'numero')::int,
             'ganhador_nome', c->>'ganhador_nome',
             'sem_ganhador', (c->>'sem_ganhador')::boolean)
           order by (c->>'ordem')::int)
      into v_resultado_publico
    from jsonb_array_elements(v_r.resultado_sorteio) c;
  end if;

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
      'premios_extras', coalesce(v_r.premios_extras, '[]'::jsonb),
      'total_numeros', v_r.total_numeros,
      'preco_numero_centavos', v_r.preco_numero_centavos,
      'promocoes', v_r.promocoes,
      'status', v_r.status,
      'data_sorteio_prevista', v_r.data_sorteio_prevista,
      'metodo_sorteio', v_r.metodo_sorteio,
      'max_numeros_por_pedido', v_r.max_numeros_por_pedido,
      'minutos_reserva', v_r.minutos_reserva,
      'aceita_fiado', v_r.aceita_fiado,
      'numeracao_desde_zero', v_r.numeracao_desde_zero
    ),
    'progresso', jsonb_build_object(
      'pagos', coalesce(v_pagos, 0),
      'reservados', coalesce(v_reservados, 0),
      'disponiveis', v_r.total_numeros - coalesce(v_pagos, 0) - coalesce(v_reservados, 0)
    ),
    'numeros_ocupados', case when v_ocupados is null then null else to_jsonb(v_ocupados) end,
    'numeros_pagos', case when v_numeros_pagos is null then null else to_jsonb(v_numeros_pagos) end,
    'numeros_com_nome', v_numeros_com_nome,
    'ultimas_compras', v_ultimas,
    'ranking', v_ranking,
    'cotas_premiadas', v_cotas,
    'resultado', case when v_r.status = 'sorteada' then jsonb_build_object(
      'numero_sorteado', v_r.numero_sorteado,
      'ganhador_nome', v_r.ganhador_nome,
      'sorteada_em', v_r.sorteada_em,
      'lista', v_resultado_publico
    ) end,
    'branding', coalesce(v_branding, '{}'::jsonb),
    'chave_pix', v_pix
  );
end;
$function$

