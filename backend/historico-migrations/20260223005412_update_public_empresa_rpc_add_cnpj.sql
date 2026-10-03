
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

;
