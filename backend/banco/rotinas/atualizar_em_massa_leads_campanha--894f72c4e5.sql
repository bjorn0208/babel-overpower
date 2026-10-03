CREATE OR REPLACE FUNCTION public.atualizar_em_massa_leads_campanha(p_tenant_id uuid, p_campaign_id uuid, p_lead_ids uuid[], p_acao text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_afetados int := 0;
BEGIN
  IF p_acao NOT IN ('pausar','reativar','arquivar') THEN
    RAISE EXCEPTION 'ação inválida: %. Aceitas: pausar|reativar|arquivar', p_acao
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Valida tenant ownership
  PERFORM 1 FROM public.campanhas
   WHERE id = p_campaign_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign % não pertence ao tenant %', p_campaign_id, p_tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_acao = 'pausar' THEN
    UPDATE public.leads_campanha
       SET state = 'pausado'
     WHERE id = ANY(p_lead_ids) AND campaign_id = p_campaign_id;
  ELSIF p_acao = 'reativar' THEN
    UPDATE public.leads_campanha
       SET state = 'ativo'
     WHERE id = ANY(p_lead_ids) AND campaign_id = p_campaign_id AND state = 'pausado';
  ELSIF p_acao = 'arquivar' THEN
    UPDATE public.leads_campanha
       SET archived_at = now()
     WHERE id = ANY(p_lead_ids) AND campaign_id = p_campaign_id AND archived_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_afetados = ROW_COUNT;
  RETURN v_afetados;
END;
$function$

