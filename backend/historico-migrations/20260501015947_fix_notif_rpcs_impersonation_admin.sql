
-- Corrige as 3 RPCs de notificação que não checavam is_platform_admin()
-- Impersonação falhava silenciosamente porque auth.uid() é do admin, não do tenant

CREATE OR REPLACE FUNCTION public.metricas_unread_humano(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := (select auth.uid());
  v_atendimento int;
  v_clientes int;
  v_campanha int;
  v_handoffs int;
BEGIN
  IF p_tenant_id != v_caller
     AND NOT public.is_platform_admin()
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = v_caller AND parent_user_id = p_tenant_id
     )
  THEN
    RAISE EXCEPTION 'sem permissao pra ver metricas do tenant';
  END IF;

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
$function$;


CREATE OR REPLACE FUNCTION public.marcar_conversa_lida(p_conv_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_caller uuid := (select auth.uid());
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.conversations WHERE id = p_conv_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  IF v_tenant != v_caller
     AND NOT public.is_platform_admin()
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = v_caller AND parent_user_id = v_tenant
     )
  THEN
    RAISE EXCEPTION 'sem permissao pra marcar conversa lida';
  END IF;

  UPDATE public.conversations
  SET visto_em = now()
  WHERE id = p_conv_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.marcar_handoff_atendido(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_caller uuid := (select auth.uid());
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.leads WHERE id = p_lead_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  IF v_tenant != v_caller
     AND NOT public.is_platform_admin()
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = v_caller AND parent_user_id = v_tenant
     )
  THEN
    RAISE EXCEPTION 'sem permissao pra atender handoff';
  END IF;

  UPDATE public.leads
  SET needs_human_help = false
  WHERE id = p_lead_id;

  UPDATE public.conversations
  SET visto_em = now(), status = 'human', agent_enabled = false
  WHERE lead_id = p_lead_id;
END;
$function$;

;
