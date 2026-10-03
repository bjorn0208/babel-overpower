
-- RPC to get empresa data for public tracking page (via tracking_token)
CREATE OR REPLACE FUNCTION public.get_public_empresa_data(p_token text)
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

-- RPC to get client documents for public tracking page (via tracking_token)
CREATE OR REPLACE FUNCTION public.get_public_client_documents(p_token text)
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

GRANT EXECUTE ON FUNCTION public.get_public_empresa_data(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_client_documents(text) TO anon, authenticated;

;
