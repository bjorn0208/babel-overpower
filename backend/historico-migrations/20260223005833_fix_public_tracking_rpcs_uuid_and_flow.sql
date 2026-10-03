
-- Fix: change parameter from text to uuid to match tracking_token column type
DROP FUNCTION IF EXISTS public.get_public_empresa_data(text);
DROP FUNCTION IF EXISTS public.get_public_client_documents(text);

CREATE OR REPLACE FUNCTION public.get_public_empresa_data(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_result json;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.leads
  WHERE tracking_token = p_token
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'nome', e.nome,
    'cnpj', e.cnpj,
    'descricao', e.descricao,
    'logo_url', e.logo_url,
    'banner_url', e.banner_url,
    'whatsapp', e.whatsapp,
    'instagram', e.instagram,
    'site', e.site,
    'cidade', e.cidade,
    'estado', e.estado
  ) INTO v_result
  FROM public.empresas e
  WHERE e.user_id = v_tenant_id
  LIMIT 1;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_client_documents(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_result json;
BEGIN
  SELECT id INTO v_lead_id
  FROM public.leads
  WHERE tracking_token = p_token
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'id', d.id,
    'file_name', d.file_name,
    'label', d.label,
    'file_path', d.file_path,
    'file_type', d.file_type,
    'created_at', d.created_at
  ) ORDER BY d.created_at DESC), '[]'::json) INTO v_result
  FROM public.client_documents d
  WHERE d.lead_id = v_lead_id;

  RETURN v_result;
END;
$$;

-- New: RPC to get service flow for anon (user_agents has no anon policy)
CREATE OR REPLACE FUNCTION public.get_public_service_flow(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_product text;
  v_flows json;
BEGIN
  SELECT tenant_id, product INTO v_tenant_id, v_product
  FROM public.leads
  WHERE tracking_token = p_token
  LIMIT 1;

  IF v_tenant_id IS NULL OR v_product IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ua.client_service_flows::json INTO v_flows
  FROM public.user_agents ua
  WHERE ua.user_id = v_tenant_id
  LIMIT 1;

  RETURN v_flows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_empresa_data(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_client_documents(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_service_flow(uuid) TO anon, authenticated;

;
