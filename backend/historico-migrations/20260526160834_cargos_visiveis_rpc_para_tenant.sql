-- RPC que retorna os cargos visíveis pro tenant logado:
-- 1. todos os cargos do tenant (escopo=tenant, tenant_id=auth.uid)
-- 2. cargos do nicho do tenant (escopo=nicho, nicho_id = nicho do tenant)
-- 3. globais que NÃO são substituídos por nenhum cargo do tenant logado
CREATE OR REPLACE FUNCTION public.cargos_visiveis_tenant()
RETURNS TABLE (
  id uuid,
  nome text,
  tipologia public.cargo_tipologia,
  objetivo_principal text,
  regras_livres text,
  campos_rastreio jsonb,
  ativo boolean,
  ordem integer,
  canal_atuacao text,
  escopo public.escopo_ragentic,
  tenant_id uuid,
  nicho_id uuid,
  agente_id uuid,
  substitui_global_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid := (select auth.uid());
  v_nicho uuid;
  v_substituidos uuid[];
BEGIN
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  SELECT p.nicho_id INTO v_nicho FROM public.profiles p WHERE p.id = v_tenant;

  SELECT COALESCE(array_agg(c.substitui_global_id), ARRAY[]::uuid[])
  INTO v_substituidos
  FROM public.cargos c
  WHERE c.tenant_id = v_tenant
    AND c.substitui_global_id IS NOT NULL;

  RETURN QUERY
  SELECT c.id, c.nome, c.tipologia, c.objetivo_principal, c.regras_livres,
         c.campos_rastreio, c.ativo, c.ordem, c.canal_atuacao::text, c.escopo,
         c.tenant_id, c.nicho_id, c.agente_id, c.substitui_global_id
  FROM public.cargos c
  WHERE c.ativo = true
    AND (
      c.tenant_id = v_tenant
      OR (c.escopo = 'nicho' AND c.nicho_id = v_nicho)
      OR (c.escopo = 'global' AND NOT (c.id = ANY(v_substituidos)))
    )
  ORDER BY c.ordem ASC, c.nome ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.cargos_visiveis_tenant() FROM public;
GRANT EXECUTE ON FUNCTION public.cargos_visiveis_tenant() TO authenticated;

COMMENT ON FUNCTION public.cargos_visiveis_tenant() IS
  'Retorna os cargos visíveis pro tenant logado: cargos próprios + nicho associado + globais não substituídos. Usado pelo app Agente e pelo useDadosBundle.';
;
