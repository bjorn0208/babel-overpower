CREATE OR REPLACE FUNCTION public.get_indicador_publico(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meta record;
  v_camp record;
  v_emp record;
  v_settings record;
  v_leads jsonb;
  v_comissoes jsonb;
BEGIN
  SELECT campaign_id, tenant_id, cupom, token, indicador_nome, indicador_email,
         indicador_telefone, indicador_foto_url, comissao_tipo, comissao_valor,
         pagamento_valor, pagamento_data, pagamento_metodo, comprovante_url,
         observacao, concluida_at, created_at, updated_at
    INTO v_meta
    FROM public.meta_indicacao_campanha
   WHERE token = p_token
   LIMIT 1;

  IF v_meta IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, status, starts_at, ends_at
    INTO v_camp
    FROM public.campanhas
   WHERE id = v_meta.campaign_id AND deleted_at IS NULL
   LIMIT 1;

  IF v_camp IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT nome, logo_url, descricao, cidade, estado
    INTO v_emp
    FROM public.empresas
   WHERE user_id = v_meta.tenant_id
   LIMIT 1;

  SELECT logo_url, company_name, page_color, company_description
    INTO v_settings
    FROM public.config_contrato
   WHERE tenant_id = v_meta.tenant_id
   LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', l.id,
           'nome_exibicao', l.nome_exibicao,
           'name', l.name,
           'converted_at', CASE WHEN cl.exit_reason = 'convertido' THEN cl.closed_at ELSE NULL END
         )), '[]'::jsonb)
    INTO v_leads
    FROM public.leads_campanha cl
    JOIN public.leads l ON l.id = cl.lead_id
   WHERE cl.campaign_id = v_meta.campaign_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'lead_id', lead_id,
           'valor_comissao', valor_comissao
         )), '[]'::jsonb)
    INTO v_comissoes
    FROM public.comissoes_indicacao_campanha
   WHERE campaign_id = v_meta.campaign_id;

  RETURN jsonb_build_object(
    'meta', to_jsonb(v_meta),
    'campanha', to_jsonb(v_camp),
    'empresa', to_jsonb(v_emp),
    'settings', to_jsonb(v_settings),
    'leads', v_leads,
    'comissoes', v_comissoes
  );
END;
$function$

