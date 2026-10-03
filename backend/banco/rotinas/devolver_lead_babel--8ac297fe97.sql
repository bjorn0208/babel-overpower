CREATE OR REPLACE FUNCTION public.devolver_lead_babel(p_entrega_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lead uuid;
begin
  update public.entregas_lead_babel
     set devolvido_em = now(), devolvido_motivo = coalesce(p_motivo, 'sem motivo')
   where id = p_entrega_id and devolvido_em is null and deleted_at is null
   returning lead_babel_id into v_lead;
  if v_lead is null then
    return jsonb_build_object('ok', false, 'erro', 'entrega_nao_encontrada_ou_ja_devolvida');
  end if;
  update public.leads_babel set status = 'pronto', atualizado_em = now() where id = v_lead;
  return jsonb_build_object('ok', true, 'lead_babel_id', v_lead);
end;
$function$

