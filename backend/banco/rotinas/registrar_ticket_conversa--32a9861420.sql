CREATE OR REPLACE FUNCTION public.registrar_ticket_conversa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant_id uuid; v_phone text; v_agent_count integer; v_ciclos integer; v_origem text; v_campaign_lead_id uuid; v_ciclo_bucket integer; v_inserted integer;
BEGIN
  IF NEW.role != 'assistant' THEN RETURN NEW; END IF;
  SELECT c.tenant_id, c.phone INTO v_tenant_id, v_phone FROM public.conversas c WHERE c.id = NEW.conversation_id;
  IF v_tenant_id IS NULL THEN RETURN NEW; END IF;
  IF v_phone IS NOT NULL AND v_phone LIKE 'chat-test%' THEN RETURN NEW; END IF;
  SELECT COALESCE(us.max_ciclos_por_conversa, 30) INTO v_ciclos FROM public.assinaturas_usuario us
  WHERE us.user_id = v_tenant_id AND us.status IN ('active','ativa') AND us.data_expiracao >= now() LIMIT 1;
  IF v_ciclos IS NULL THEN RETURN NEW; END IF;
  IF NEW.campaign_lead_id IS NOT NULL THEN
    v_origem := 'campanha'; v_campaign_lead_id := NEW.campaign_lead_id;
    SELECT COUNT(*) INTO v_agent_count FROM public.mensagens m
    WHERE m.conversation_id = NEW.conversation_id AND m.role='assistant' AND m.campaign_lead_id = v_campaign_lead_id AND m.created_at <= NEW.created_at;
  ELSE
    v_origem := 'espontaneo'; v_campaign_lead_id := NULL;
    SELECT COUNT(*) INTO v_agent_count FROM public.mensagens m
    WHERE m.conversation_id = NEW.conversation_id AND m.role='assistant' AND m.campaign_lead_id IS NULL AND m.created_at <= NEW.created_at;
  END IF;
  IF (v_agent_count - 1) % v_ciclos = 0 THEN
    v_ciclo_bucket := floor((v_agent_count - 1)::numeric / v_ciclos::numeric)::int;
    INSERT INTO public.tickets_conversa (tenant_id, conversation_id, origem, campaign_lead_id, ciclo_bucket, created_at)
    VALUES (v_tenant_id, NEW.conversation_id, v_origem, v_campaign_lead_id, v_ciclo_bucket, NEW.created_at) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      UPDATE public.assinaturas_usuario SET conversas_usadas = COALESCE(conversas_usadas, 0) + 1, updated_at = now()
      WHERE user_id = v_tenant_id AND status IN ('active','ativa');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$

