CREATE OR REPLACE FUNCTION public.obter_pedido_rifa_por_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'phone', v_p.phone,
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
$function$

