-- App Consulta F3 — entrega config + credencial da API pro edge (service_role only)
CREATE OR REPLACE FUNCTION public.ler_config_consulta(p_provedor text DEFAULT 'motordecredito')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url_base text;
  v_secret_nome text;
  v_credencial text;
BEGIN
  SELECT url_base, secret_nome INTO v_url_base, v_secret_nome
  FROM public.consultas_config_api
  WHERE provedor = p_provedor AND ativo = true
  LIMIT 1;

  IF v_url_base IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'config_ausente_ou_inativa');
  END IF;

  SELECT decrypted_secret INTO v_credencial
  FROM vault.decrypted_secrets
  WHERE name = v_secret_nome;

  IF v_credencial IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'credencial_ausente');
  END IF;

  RETURN jsonb_build_object('ok', true, 'url_base', v_url_base, 'credencial', v_credencial::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ler_config_consulta(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ler_config_consulta(text) TO service_role;
;
