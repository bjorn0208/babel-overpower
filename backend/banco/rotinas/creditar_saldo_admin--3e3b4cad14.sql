CREATE OR REPLACE FUNCTION public.creditar_saldo_admin(p_tenant_id uuid, p_valor numeric, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saldo numeric(10,2);
BEGIN
  IF NOT public.eh_admin_plataforma() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;
  IF p_tenant_id IS NULL OR p_valor IS NULL OR p_valor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'parametros_invalidos');
  END IF;

  INSERT INTO public.consultas_saldo (tenant_id) VALUES (p_tenant_id)
    ON CONFLICT (tenant_id) DO NOTHING;

  SELECT saldo INTO v_saldo FROM public.consultas_saldo
    WHERE tenant_id = p_tenant_id FOR UPDATE;

  UPDATE public.consultas_saldo
    SET saldo = saldo + p_valor, atualizado_em = now()
    WHERE tenant_id = p_tenant_id;

  INSERT INTO public.consultas_carteira_mov (tenant_id, tipo, valor, saldo_apos)
    VALUES (p_tenant_id, 'credito', p_valor, v_saldo + p_valor);

  RETURN jsonb_build_object('ok', true, 'saldo_apos', v_saldo + p_valor, 'motivo', p_motivo);
END;
$function$

