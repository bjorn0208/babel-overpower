CREATE OR REPLACE FUNCTION public.rifa_confirmar_pagamento_core(p_tenant uuid, p_pedido uuid, p_aprovar boolean, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p public.pedidos_rifa%rowtype;
  v_cotas_ganhas jsonb := '[]'::jsonb;
begin
  -- Tranca de identidade (2026-09-08): não pode viver só no GRANT.
  PERFORM public.tenant_efetivo(p_tenant);
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
$function$

