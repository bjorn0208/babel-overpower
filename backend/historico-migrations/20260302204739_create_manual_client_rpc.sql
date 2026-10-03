
CREATE OR REPLACE FUNCTION public.create_manual_client(
  p_name text,
  p_phone text,
  p_product text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_agent_id uuid;
  v_lead_id uuid;
  v_conv_id uuid;
  v_token text;
  v_existing_lead_id uuid;
BEGIN
  -- Resolve tenant (owner or parent)
  SELECT COALESCE(p.parent_user_id, p.id) INTO v_user_id
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- Check duplicate phone for this tenant
  SELECT l.id INTO v_existing_lead_id
  FROM public.leads l
  WHERE l.tenant_id = v_user_id
    AND l.phone = p_phone
  LIMIT 1;

  IF v_existing_lead_id IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe um lead com este telefone';
  END IF;

  -- Get agent_id
  SELECT ua.id INTO v_agent_id
  FROM public.user_agents ua
  WHERE ua.user_id = v_user_id
  LIMIT 1;

  -- Generate tracking token
  v_token := encode(gen_random_bytes(16), 'hex');

  -- Insert lead
  INSERT INTO public.leads (
    tenant_id, name, display_name, phone, email, product,
    pipeline_stage, client_stage, converted_at, tracking_token,
    lead_source, lead_temperature
  ) VALUES (
    v_user_id, p_name, p_name, p_phone, p_email, COALESCE(p_product, ''),
    'fechado', 'documentacao', now(), v_token,
    'manual', 'quente'
  ) RETURNING id INTO v_lead_id;

  -- Insert conversation
  INSERT INTO public.conversations (
    tenant_id, lead_id, phone, channel, status, agent_enabled
  ) VALUES (
    v_user_id, v_lead_id, p_phone, 'whatsapp', 'active', true
  ) RETURNING id INTO v_conv_id;

  -- Create lead_card if agent exists
  IF v_agent_id IS NOT NULL THEN
    INSERT INTO public.lead_cards (
      conversation_id, lead_id, agent_id, ciclo, fase
    ) VALUES (
      v_conv_id, v_lead_id, v_agent_id, 1, 'fechado'
    );
  END IF;

  RETURN jsonb_build_object(
    'lead_id', v_lead_id,
    'conversation_id', v_conv_id,
    'tracking_token', v_token
  );
END;
$$;

;
