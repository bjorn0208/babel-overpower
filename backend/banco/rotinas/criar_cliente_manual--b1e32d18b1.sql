CREATE OR REPLACE FUNCTION public.criar_cliente_manual(p_name text, p_phone text, p_product text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid; v_agent_id uuid; v_lead_id uuid; v_conv_id uuid; v_token text; v_existing_lead_id uuid;
BEGIN
  SELECT COALESCE(p.parent_user_id, p.id) INTO v_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid());
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  SELECT l.id INTO v_existing_lead_id FROM public.leads l WHERE l.tenant_id = v_user_id AND l.phone = p_phone LIMIT 1;
  IF v_existing_lead_id IS NOT NULL THEN RAISE EXCEPTION 'Já existe um lead com este telefone'; END IF;
  SELECT ua.id INTO v_agent_id FROM public.agentes_usuario ua WHERE ua.user_id = v_user_id LIMIT 1;
  v_token := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.leads (tenant_id, name, nome_exibicao, phone, email, produto, fase_pipeline, fase_cliente, converted_at, chave_rastreamento, origem_lead, temperatura_lead)
  VALUES (v_user_id, p_name, p_name, p_phone, p_email, COALESCE(p_product, ''), 'fechado', 'documentacao', now(), v_token, 'manual', 'quente') RETURNING id INTO v_lead_id;
  INSERT INTO public.conversas (tenant_id, lead_id, phone, channel, status, agent_enabled)
  VALUES (v_user_id, v_lead_id, p_phone, 'whatsapp', 'ativa', true) RETURNING id INTO v_conv_id;
  IF v_agent_id IS NOT NULL THEN
    INSERT INTO public.fichas_lead (conversation_id, lead_id, agente_id, ciclo, fase) VALUES (v_conv_id, v_lead_id, v_agent_id, 1, 'fechado');
  END IF;
  RETURN jsonb_build_object('lead_id', v_lead_id, 'conversation_id', v_conv_id, 'tracking_token', v_token);
END;
$function$

