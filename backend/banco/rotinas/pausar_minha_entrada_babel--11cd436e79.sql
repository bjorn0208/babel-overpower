CREATE OR REPLACE FUNCTION public.pausar_minha_entrada_babel(p_campanha_babel_id uuid, p_pausado boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.campanhas_babel_participantes
     set pausado = p_pausado, atualizado_em = now()
   where campanha_babel_id = p_campanha_babel_id
     and tenant_id = (select auth.uid())
     and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'nao_participa');
  end if;
  return jsonb_build_object('ok', true, 'pausado', p_pausado);
end;
$function$

