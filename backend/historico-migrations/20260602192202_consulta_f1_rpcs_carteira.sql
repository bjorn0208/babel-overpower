-- App Consulta F1 — RPCs atômicas de carteira (FOR UPDATE + idempotência)

-- Débito antes de bater na API
CREATE OR REPLACE FUNCTION public.debitar_carteira_consulta(p_consulta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- Estorno se a API falhar
CREATE OR REPLACE FUNCTION public.estornar_carteira_consulta(p_consulta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- Aprovar recarga (só admin) — crédito idempotente
CREATE OR REPLACE FUNCTION public.aprovar_recarga(p_recarga_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_credito numeric(10,2);
  v_status text;
  v_saldo numeric(10,2);
BEGIN
  IF NOT public.eh_admin_plataforma() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;

  SELECT tenant_id, credito, status INTO v_tenant, v_credito, v_status
  FROM public.consultas_recargas WHERE id = p_recarga_id FOR UPDATE;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'recarga_nao_encontrada');
  END IF;
  IF v_status = 'aprovado' THEN
    RETURN jsonb_build_object('ok', true, 'erro', 'ja_aprovado');
  END IF;

  INSERT INTO public.consultas_saldo (tenant_id) VALUES (v_tenant)
    ON CONFLICT (tenant_id) DO NOTHING;

  SELECT saldo INTO v_saldo FROM public.consultas_saldo
    WHERE tenant_id = v_tenant FOR UPDATE;

  UPDATE public.consultas_saldo
    SET saldo = saldo + v_credito, atualizado_em = now()
    WHERE tenant_id = v_tenant;

  UPDATE public.consultas_recargas
    SET status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now()
    WHERE id = p_recarga_id;

  INSERT INTO public.consultas_carteira_mov (tenant_id, tipo, valor, saldo_apos, recarga_id)
    VALUES (v_tenant, 'credito', v_credito, v_saldo + v_credito, p_recarga_id);

  RETURN jsonb_build_object('ok', true, 'saldo_apos', v_saldo + v_credito);
END;
$$;

-- Privilégios: débito/estorno só service_role (edge); aprovar_recarga authenticated (checa admin dentro)
REVOKE EXECUTE ON FUNCTION public.debitar_carteira_consulta(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estornar_carteira_consulta(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debitar_carteira_consulta(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.estornar_carteira_consulta(uuid) TO service_role;
;
