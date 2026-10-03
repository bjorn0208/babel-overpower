CREATE OR REPLACE FUNCTION public.rifa_dossie_agente(p_tenant_id uuid, p_phone text DEFAULT NULL::text, p_lead_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Tranca de identidade (2026-09-08): não pode viver só no GRANT.
  PERFORM public.tenant_efetivo(p_tenant_id);
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
    and status = 'ativo'
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
$function$

