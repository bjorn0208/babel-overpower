CREATE OR REPLACE FUNCTION public.buscar_ou_criar_conversa(p_phone text, p_tenant_id uuid, p_agent_id uuid, p_channel text DEFAULT 'chat'::text, p_first_fase text DEFAULT 'saudacao'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_conv record;
  v_lead_id uuid;
  v_ficha record;
  v_lead_converted boolean;
  v_agent_active boolean;
BEGIN
  p_tenant_id := public.tenant_efetivo(p_tenant_id);

  PERFORM pg_advisory_xact_lock(hashtext(p_phone || COALESCE(p_tenant_id::text, '')));

  SELECT COALESCE(is_active, true) INTO v_agent_active
  FROM public.agentes_usuario
  WHERE id = p_agent_id;

  SELECT * INTO v_conv FROM public.conversas
  WHERE phone = ANY(public.telefones_equivalentes(p_phone)) AND tenant_id IS NOT DISTINCT FROM p_tenant_id AND status IN ('active', 'ativa')
  ORDER BY created_at DESC LIMIT 1;
  IF v_conv IS NULL THEN
    SELECT * INTO v_conv FROM public.conversas
    WHERE phone = ANY(public.telefones_equivalentes(p_phone)) AND tenant_id IS NOT DISTINCT FROM p_tenant_id
      AND status IN ('human', 'closed', 'humano', 'encerrada')
      AND created_at > now() - interval '30 days'
    ORDER BY created_at DESC LIMIT 1;
    IF v_conv IS NOT NULL THEN
      UPDATE public.conversas SET status = 'ativa' WHERE id = v_conv.id RETURNING * INTO v_conv;
    END IF;
  END IF;
  IF v_conv IS NOT NULL THEN
    SELECT (converted_at IS NOT NULL) INTO v_lead_converted FROM public.leads WHERE id = v_conv.lead_id;
    IF v_lead_converted AND v_conv.agent_enabled = true THEN
      UPDATE public.conversas SET agent_enabled = false WHERE id = v_conv.id;
      v_conv.agent_enabled := false;
    END IF;
  END IF;
  IF v_conv IS NULL THEN
    SELECT id INTO v_lead_id FROM public.leads
    WHERE phone = ANY(public.telefones_equivalentes(p_phone)) AND tenant_id IS NOT DISTINCT FROM p_tenant_id
    ORDER BY created_at DESC LIMIT 1;
    IF v_lead_id IS NULL THEN
      INSERT INTO public.leads (agente_id, phone, name, canal_externo, tenant_id)
      VALUES (p_agent_id, p_phone, p_phone, p_channel, p_tenant_id) RETURNING id INTO v_lead_id;
    END IF;
    SELECT (converted_at IS NOT NULL) INTO v_lead_converted FROM public.leads WHERE id = v_lead_id;
    INSERT INTO public.conversas (lead_id, phone, status, channel, tenant_id, agent_enabled, agente_id)
    VALUES (
      v_lead_id, p_phone, 'ativa', p_channel, p_tenant_id,
      v_agent_active AND NOT COALESCE(v_lead_converted, false),
      p_agent_id
    )
    RETURNING * INTO v_conv;
  END IF;
  SELECT * INTO v_ficha FROM public.fichas_lead WHERE conversation_id = v_conv.id LIMIT 1;
  IF v_ficha IS NULL THEN
    INSERT INTO public.fichas_lead (conversation_id, lead_id, agente_id, fase, ciclo, dados_capturados)
    VALUES (v_conv.id, v_conv.lead_id, p_agent_id, p_first_fase, 1, '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object('conversation', jsonb_build_object('id', v_conv.id, 'lead_id', v_conv.lead_id, 'status', v_conv.status));
END;
$function$

