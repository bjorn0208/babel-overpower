CREATE OR REPLACE FUNCTION public.enviar_comprovante_rifa_publico(p_token uuid, p_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

