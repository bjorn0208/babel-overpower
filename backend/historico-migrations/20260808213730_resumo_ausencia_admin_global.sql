-- Admin da plataforma não tem tenant próprio com movimento (0 conversas, 0
-- contratos), então o resumo dele era sempre vazio. Pra quem é platform_admin,
-- o recorte passa a ser a plataforma inteira.
CREATE OR REPLACE FUNCTION public.resumo_ausencia(p_desde timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_tenant    uuid;
  v_global    boolean := false;
  v_mensagens integer := 0;
  v_contratos integer := 0;
  v_pix       integer := 0;
  v_pix_valor numeric := 0;
  v_creditos  numeric;
BEGIN
  IF v_uid IS NULL OR p_desde IS NULL THEN
    RETURN jsonb_build_object('mensagens', 0, 'contratos', 0, 'pix', 0, 'pix_valor', 0, 'creditos', 0);
  END IF;

  -- Membro de equipe enxerga o movimento do tenant dono da conta.
  SELECT COALESCE(p.parent_user_id, p.id), (p.system_role = 'platform_admin')
    INTO v_tenant, v_global
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('mensagens', 0, 'contratos', 0, 'pix', 0, 'pix_valor', 0, 'creditos', 0);
  END IF;

  -- Mensagens que o lead mandou. O filtro por conversa recém-atualizada corta o
  -- escaneamento: conversa sem updated_at novo não pode ter mensagem nova.
  SELECT count(*) INTO v_mensagens
  FROM public.conversas c
  JOIN public.mensagens m ON m.conversation_id = c.id
  WHERE (v_global OR c.tenant_id = v_tenant)
    AND c.updated_at > p_desde
    AND m.created_at > p_desde
    AND m.role = 'user'
    AND m.deleted_at IS NULL;

  SELECT count(*) INTO v_contratos
  FROM public.contratos ct
  WHERE (v_global OR ct.tenant_id = v_tenant)
    AND ct.assinado_em > p_desde;

  SELECT count(*), COALESCE(sum(pc.valor), 0) INTO v_pix, v_pix_valor
  FROM public.pagamentos_cliente pc
  WHERE (v_global OR pc.tenant_id = v_tenant)
    AND pc.status = 'pago'
    AND COALESCE(pc.data_pagamento::timestamptz, pc.updated_at, pc.created_at) > p_desde;

  IF v_global THEN
    SELECT COALESCE(sum(cs.saldo), 0) INTO v_creditos FROM public.consultas_saldo cs;
  ELSE
    SELECT cs.saldo INTO v_creditos
    FROM public.consultas_saldo cs
    WHERE cs.tenant_id = v_tenant;
  END IF;

  RETURN jsonb_build_object(
    'mensagens', v_mensagens,
    'contratos', v_contratos,
    'pix',       v_pix,
    'pix_valor', v_pix_valor,
    'creditos',  COALESCE(v_creditos, 0),
    'global',    v_global
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resumo_ausencia(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resumo_ausencia(timestamptz) FROM anon;
GRANT  EXECUTE ON FUNCTION public.resumo_ausencia(timestamptz) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.resumo_ausencia(timestamptz) TO service_role;
;
