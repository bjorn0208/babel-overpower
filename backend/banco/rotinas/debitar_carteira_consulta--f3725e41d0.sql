CREATE OR REPLACE FUNCTION public.debitar_carteira_consulta(p_consulta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_custo numeric(10,2);
  v_saldo numeric(10,2);
BEGIN
  SELECT c.tenant_id, COALESCE(c.custo, t.custo)
    INTO v_tenant, v_custo
  FROM public.consultas c
  LEFT JOIN public.consultas_tipos t ON t.id = c.tipo_id
  WHERE c.id = p_consulta_id;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'consulta_nao_encontrada');
  END IF;
  IF v_custo IS NULL OR v_custo <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'custo_invalido');
  END IF;

  IF EXISTS (SELECT 1 FROM public.consultas_carteira_mov
             WHERE consulta_id = p_consulta_id AND tipo = 'debito') THEN
    RETURN jsonb_build_object('ok', true, 'erro', 'ja_debitado');
  END IF;

  INSERT INTO public.consultas_saldo (tenant_id) VALUES (v_tenant)
    ON CONFLICT (tenant_id) DO NOTHING;

  SELECT saldo INTO v_saldo FROM public.consultas_saldo
    WHERE tenant_id = v_tenant FOR UPDATE;

  IF v_saldo < v_custo THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'saldo_insuficiente',
                              'saldo', v_saldo, 'custo', v_custo);
  END IF;

  UPDATE public.consultas_saldo
    SET saldo = saldo - v_custo, atualizado_em = now()
    WHERE tenant_id = v_tenant;

  UPDATE public.consultas SET custo = v_custo
    WHERE id = p_consulta_id AND custo IS NULL;

  INSERT INTO public.consultas_carteira_mov (tenant_id, tipo, valor, saldo_apos, consulta_id)
    VALUES (v_tenant, 'debito', v_custo, v_saldo - v_custo, p_consulta_id);

  RETURN jsonb_build_object('ok', true, 'saldo_apos', v_saldo - v_custo);
END;
$function$

