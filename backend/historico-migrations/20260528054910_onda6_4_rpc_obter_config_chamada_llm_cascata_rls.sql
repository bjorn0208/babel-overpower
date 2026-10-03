-- ============================================================================
-- Onda 6.4 — RPC obter_config_chamada_llm (cascata tenant→nicho→global) + RLS
-- ============================================================================

-- 1) Policies adicionais (preservar admin_all existente; adicionar 2 novas)
DROP POLICY IF EXISTS config_chamadas_global_read ON public.config_chamadas_llm;
CREATE POLICY config_chamadas_global_read ON public.config_chamadas_llm
  FOR SELECT TO authenticated
  USING (escopo = 'global' AND ativo = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS config_chamadas_tenant_own ON public.config_chamadas_llm;
CREATE POLICY config_chamadas_tenant_own ON public.config_chamadas_llm
  FOR ALL TO authenticated
  USING (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  WITH CHECK (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS config_chamadas_nicho_read ON public.config_chamadas_llm;
CREATE POLICY config_chamadas_nicho_read ON public.config_chamadas_llm
  FOR SELECT TO authenticated
  USING (escopo = 'nicho' AND ativo = true AND deleted_at IS NULL);

-- 2) RPC cascata: tenant → nicho → global (returns SETOF pra flexibilidade)
CREATE OR REPLACE FUNCTION public.obter_config_chamada_llm(
  p_chave text,
  p_tenant_id uuid DEFAULT NULL,
  p_nicho_id uuid DEFAULT NULL
)
RETURNS public.config_chamadas_llm
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
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
$func$;

-- 3) Grant pra anon + authenticated (motor + admin usam)
GRANT EXECUTE ON FUNCTION public.obter_config_chamada_llm(text, uuid, uuid) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.obter_config_chamada_llm IS 
'Lookup com fallback em cascata tenant→nicho→global. Retorna NULL se nada encontrado (motor usa hardcoded).';

;
