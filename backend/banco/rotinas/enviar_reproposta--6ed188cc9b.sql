CREATE OR REPLACE FUNCTION public.enviar_reproposta(p_campaign_lead_ids uuid[], p_texto text DEFAULT NULL::text)
 RETURNS TABLE(campaign_lead_id uuid, reproposta_id uuid, scheduled_action_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_rec record; v_repid uuid; v_actid uuid; v_conv uuid; v_agent uuid; v_idx integer := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  FOR v_rec IN
    SELECT cl.id AS cl_id, cl.lead_id AS lead_id, cl.campaign_id AS campaign_id, cl.reproposta_count AS rep_count,
           c.tenant_id AS tenant_id, c.status AS campaign_status, c.deleted_at AS campaign_deleted_at
    FROM public.leads_campanha cl JOIN public.campanhas c ON c.id = cl.campaign_id
    WHERE cl.id = ANY(p_campaign_lead_ids)
      AND (c.tenant_id = v_caller
           OR c.tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = v_caller AND p.parent_user_id IS NOT NULL)
           OR public.is_platform_admin())
  LOOP
    IF v_rec.campaign_deleted_at IS NOT NULL OR v_rec.campaign_status NOT IN ('active','paused','ativa','pausada') THEN
      campaign_lead_id := v_rec.cl_id; reproposta_id := NULL; scheduled_action_id := NULL; status := 'campanha_inativa';
      RETURN NEXT; CONTINUE;
    END IF;
    IF v_rec.rep_count >= 10 THEN
      campaign_lead_id := v_rec.cl_id; reproposta_id := NULL; scheduled_action_id := NULL; status := 'throttle_atingido';
      RETURN NEXT; CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.exclusoes_tenant toov WHERE toov.tenant_id = v_rec.tenant_id AND toov.lead_id = v_rec.lead_id) THEN
      campaign_lead_id := v_rec.cl_id; reproposta_id := NULL; scheduled_action_id := NULL; status := 'opt_out';
      RETURN NEXT; CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.leads l WHERE l.id = v_rec.lead_id AND l.opt_out_at IS NOT NULL) THEN
      campaign_lead_id := v_rec.cl_id; reproposta_id := NULL; scheduled_action_id := NULL; status := 'opt_out_lead';
      RETURN NEXT; CONTINUE;
    END IF;
    UPDATE public.acoes_agendadas SET status = 'cancelado'
    WHERE lead_id = v_rec.lead_id AND status IN ('pending','pendente')
      AND action_type IN ('campaign_trigger','campaign_reproposta','retomada_encerramento');
    v_idx := v_idx + 1;
    INSERT INTO public.repropostas_lead_campanha (campaign_lead_id, texto, created_by)
    VALUES (v_rec.cl_id, COALESCE(p_texto,''), v_caller) RETURNING id INTO v_repid;
    SELECT co.id, co.agente_id INTO v_conv, v_agent FROM public.conversas co
    WHERE co.lead_id = v_rec.lead_id AND co.tenant_id = v_rec.tenant_id ORDER BY co.updated_at DESC NULLS LAST LIMIT 1;
    INSERT INTO public.acoes_agendadas (lead_id, conversation_id, agente_id, action_type, scheduled_at, status, carga)
    VALUES (v_rec.lead_id, v_conv, v_agent, 'campaign_reproposta', now() + ((v_idx - 1) * interval '1 minute'), 'pendente',
            jsonb_build_object('campaign_id', v_rec.campaign_id, 'campaign_lead_id', v_rec.cl_id, 'reproposta_id', v_repid, 'texto_personalizado', COALESCE(p_texto,'')))
    RETURNING id INTO v_actid;
    UPDATE public.leads_campanha SET reproposta_count = reproposta_count + 1 WHERE id = v_rec.cl_id;
    campaign_lead_id := v_rec.cl_id; reproposta_id := v_repid; scheduled_action_id := v_actid; status := 'enfileirada';
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$function$

