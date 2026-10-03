CREATE OR REPLACE FUNCTION public.aprovar_recarga(p_recarga_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_pacote uuid;
  v_credito numeric(10,2);
  v_status text;
  v_saldo numeric(10,2);
BEGIN
  IF NOT public.eh_admin_plataforma() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;

  SELECT tenant_id, pacote_id, status INTO v_tenant, v_pacote, v_status
  FROM public.consultas_recargas WHERE id = p_recarga_id FOR UPDATE;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'recarga_nao_encontrada');
  END IF;
  IF v_status = 'aprovado' THEN
    RETURN jsonb_build_object('ok', true, 'erro', 'ja_aprovado');
  END IF;

  -- Crédito canônico: lido do pacote, não da linha da recarga.
  SELECT credito INTO v_credito FROM public.consultas_pacotes
    WHERE id = v_pacote AND ativo = true AND deleted_at IS NULL;
  IF v_credito IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'pacote_invalido');
  END IF;

  INSERT INTO public.consultas_saldo (tenant_id) VALUES (v_tenant)
    ON CONFLICT (tenant_id) DO NOTHING;

  SELECT saldo INTO v_saldo FROM public.consultas_saldo
    WHERE tenant_id = v_tenant FOR UPDATE;

  UPDATE public.consultas_saldo
    SET saldo = saldo + v_credito, atualizado_em = now()
    WHERE tenant_id = v_tenant;

  -- Sincroniza a linha com o valor canônico (corrige eventual forja).
  UPDATE public.consultas_recargas
    SET status = 'aprovado', credito = v_credito,
        aprovado_por = (select auth.uid()), aprovado_em = now()
    WHERE id = p_recarga_id;

  INSERT INTO public.consultas_carteira_mov (tenant_id, tipo, valor, saldo_apos, recarga_id)
    VALUES (v_tenant, 'credito', v_credito, v_saldo + v_credito, p_recarga_id);

  RETURN jsonb_build_object('ok', true, 'saldo_apos', v_saldo + v_credito);
END;
$function$

