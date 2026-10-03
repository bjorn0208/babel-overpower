-- ============================================================================
-- RPC: marcar conversa como lida (visto_em = now())
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marcar_conversa_lida(p_conv_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_caller uuid := (select auth.uid());
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.conversations WHERE id = p_conv_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  IF v_tenant != v_caller AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller AND parent_user_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'sem permissao pra marcar conversa lida';
  END IF;

  UPDATE public.conversations
  SET visto_em = now()
  WHERE id = p_conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_conversa_lida(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.marcar_conversa_lida(uuid) TO authenticated;

-- ============================================================================
-- RPC: marcar handoff atendido (reseta needs_human_help + assume conversa)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marcar_handoff_atendido(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_caller uuid := (select auth.uid());
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.leads WHERE id = p_lead_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  IF v_tenant != v_caller AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller AND parent_user_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'sem permissao pra atender handoff';
  END IF;

  UPDATE public.leads
  SET needs_human_help = false
  WHERE id = p_lead_id;

  UPDATE public.conversations
  SET visto_em = now(), status = 'human', agent_enabled = false
  WHERE lead_id = p_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_handoff_atendido(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.marcar_handoff_atendido(uuid) TO authenticated;

-- ============================================================================
-- RPC: métricas de não lidas por módulo + handoffs pendentes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.metricas_unread_humano(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_caller uuid := (select auth.uid());
  v_atendimento int;
  v_clientes int;
  v_campanha int;
  v_handoffs int;
BEGIN
  IF p_tenant_id != v_caller AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller AND parent_user_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'sem permissao pra ver metricas do tenant';
  END IF;

  -- Atendimento
  SELECT count(DISTINCT c.id) INTO v_atendimento
  FROM public.conversations c
  JOIN public.leads l ON l.id = c.lead_id
  WHERE c.tenant_id = p_tenant_id
    AND c.agent_enabled = false
    AND coalesce(c.status, 'active') != 'campaign'
    AND l.location = 'atendimento'
    AND l.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.role = 'user'
        AND m.deleted_at IS NULL
        AND m.created_at > coalesce(c.visto_em, '1970-01-01'::timestamptz)
    );

  -- Clientes
  SELECT count(DISTINCT c.id) INTO v_clientes
  FROM public.conversations c
  JOIN public.leads l ON l.id = c.lead_id
  WHERE c.tenant_id = p_tenant_id
    AND c.agent_enabled = false
    AND l.location = 'cliente'
    AND l.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.role = 'user'
        AND m.deleted_at IS NULL
        AND m.created_at > coalesce(c.visto_em, '1970-01-01'::timestamptz)
    );

  -- Campanha
  SELECT count(DISTINCT c.id) INTO v_campanha
  FROM public.conversations c
  WHERE c.tenant_id = p_tenant_id
    AND c.agent_enabled = false
    AND (
      c.status = 'campaign'
      OR EXISTS (
        SELECT 1 FROM public.campaign_leads cl
        WHERE cl.lead_id = c.lead_id AND cl.state = 'ativo'
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.role = 'user'
        AND m.deleted_at IS NULL
        AND m.created_at > coalesce(c.visto_em, '1970-01-01'::timestamptz)
    );

  -- Handoffs pendentes (lead pediu humano)
  SELECT count(DISTINCT l.id) INTO v_handoffs
  FROM public.leads l
  WHERE l.tenant_id = p_tenant_id
    AND l.needs_human_help = true
    AND l.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'atendimento',         v_atendimento,
    'clientes',            v_clientes,
    'campanha',            v_campanha,
    'handoffs_pendentes',  v_handoffs,
    'total',               v_atendimento + v_clientes + v_campanha + v_handoffs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.metricas_unread_humano(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.metricas_unread_humano(uuid) TO authenticated;

-- ============================================================================
-- RPC: lista conversas com unread (pra badge na linha da lista)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.conversas_unread_humano(p_tenant_id uuid)
RETURNS TABLE(conversation_id uuid, ultima_msg_em timestamptz, qtd_msgs_novas int, needs_human_help boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    c.id AS conversation_id,
    MAX(m.created_at) AS ultima_msg_em,
    count(*)::int AS qtd_msgs_novas,
    coalesce(bool_or(l.needs_human_help), false) AS needs_human_help
  FROM public.conversations c
  JOIN public.messages m ON m.conversation_id = c.id
  LEFT JOIN public.leads l ON l.id = c.lead_id
  WHERE c.tenant_id = p_tenant_id
    AND c.agent_enabled = false
    AND m.role = 'user'
    AND m.deleted_at IS NULL
    AND m.created_at > coalesce(c.visto_em, '1970-01-01'::timestamptz)
    AND (
      p_tenant_id = (select auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (select auth.uid()) AND parent_user_id = p_tenant_id
      )
    )
  GROUP BY c.id;
$$;

REVOKE ALL ON FUNCTION public.conversas_unread_humano(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.conversas_unread_humano(uuid) TO authenticated;
;
