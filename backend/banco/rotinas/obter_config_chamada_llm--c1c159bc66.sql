CREATE OR REPLACE FUNCTION public.obter_config_chamada_llm(p_chave text, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid)
 RETURNS config_chamadas_llm
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_resultado public.config_chamadas_llm;
BEGIN
  -- 1) tenta override por tenant (escopo mais específico)
  IF p_tenant_id IS NOT NULL THEN
    SELECT * INTO v_resultado FROM public.config_chamadas_llm
    WHERE chave = p_chave 
      AND escopo = 'tenant' 
      AND tenant_id = p_tenant_id
      AND ativo = true 
      AND deleted_at IS NULL
    ORDER BY versao DESC
    LIMIT 1;
    IF FOUND THEN RETURN v_resultado; END IF;
  END IF;

  -- 2) tenta override por nicho
  IF p_nicho_id IS NOT NULL THEN
    SELECT * INTO v_resultado FROM public.config_chamadas_llm
    WHERE chave = p_chave 
      AND escopo = 'nicho' 
      AND nicho_id = p_nicho_id
      AND ativo = true 
      AND deleted_at IS NULL
    ORDER BY versao DESC
    LIMIT 1;
    IF FOUND THEN RETURN v_resultado; END IF;
  END IF;

  -- 3) fallback pra global
  SELECT * INTO v_resultado FROM public.config_chamadas_llm
  WHERE chave = p_chave 
    AND escopo = 'global'
    AND ativo = true 
    AND deleted_at IS NULL
  ORDER BY versao DESC
  LIMIT 1;

  -- pode retornar NULL → motor usa fallback hardcoded
  RETURN v_resultado;
END;
$function$

