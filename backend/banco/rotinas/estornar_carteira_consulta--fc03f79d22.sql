CREATE OR REPLACE FUNCTION public.estornar_carteira_consulta(p_consulta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_valor numeric(10,2);
  v_saldo numeric(10,2);
BEGIN
  SELECT tenant_id, valor INTO v_tenant, v_valor
  FROM public.consultas_carteira_mov
  WHERE consulta_id = p_consulta_id AND tipo = 'debito'
  ORDER BY created_at LIMIT 1;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_debito');
  END IF;

  IF EXISTS (SELECT 1 FROM public.consultas_carteira_mov
             WHERE consulta_id = p_consulta_id AND tipo = 'estorno') THEN
    RETURN jsonb_build_object('ok', true, 'erro', 'ja_estornado');
  END IF;

  SELECT saldo INTO v_saldo FROM public.consultas_saldo
    WHERE tenant_id = v_tenant FOR UPDATE;

  UPDATE public.consultas_saldo
    SET saldo = saldo + v_valor, atualizado_em = now()
    WHERE tenant_id = v_tenant;

  INSERT INTO public.consultas_carteira_mov (tenant_id, tipo, valor, saldo_apos, consulta_id)
    VALUES (v_tenant, 'estorno', v_valor, v_saldo + v_valor, p_consulta_id);

  RETURN jsonb_build_object('ok', true, 'saldo_apos', v_saldo + v_valor);
END;
$function$

