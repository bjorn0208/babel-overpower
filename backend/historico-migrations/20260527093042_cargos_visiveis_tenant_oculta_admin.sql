-- RPC `cargos_visiveis_tenant` é SECURITY DEFINER (bypassa RLS).
-- Precisa filtrar tipologia='admin' explicitamente — só platform_admin enxerga.
-- (Smoke: Diego ainda via admin via RPC mesmo após RLS de cargos.)

CREATE OR REPLACE FUNCTION public.cargos_visiveis_tenant(p_incluir_inativos boolean DEFAULT false)
 RETURNS TABLE(id uuid, nome text, tipologia cargo_tipologia, objetivo_principal text, regras_livres text, campos_rastreio jsonb, ativo boolean, ordem integer, canal_atuacao text, escopo escopo_ragentic, tenant_id uuid, nicho_id uuid, agente_id uuid, substitui_global_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid := (select auth.uid());
  v_nicho uuid;
  v_substituidos uuid[];
  v_eh_admin boolean := false;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  -- Determina se o caller é platform_admin (vê o cargo Admin global).
  SELECT (p.system_role = 'platform_admin') INTO v_eh_admin
  FROM public.profiles p WHERE p.id = v_tenant;
  v_eh_admin := COALESCE(v_eh_admin, false);

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
  WHERE (p_incluir_inativos OR c.ativo = true)
    -- Admin global só pra platform_admin. Qualquer outra origem do admin (impossivel pelo enum mas defensivo) tb cortada.
    AND (v_eh_admin OR c.tipologia <> 'admin'::public.cargo_tipologia)
    AND (
      c.tenant_id = v_tenant
      OR (c.escopo = 'nicho' AND c.nicho_id = v_nicho)
      OR (c.escopo = 'global' AND NOT (c.id = ANY(v_substituidos)))
    )
  ORDER BY c.ordem ASC, c.nome ASC;
END;
$function$;

COMMENT ON FUNCTION public.cargos_visiveis_tenant(boolean) IS
  'Retorna cargos visíveis pro tenant: global (não substituído) + nicho + tenant. Cargo Admin (tipologia=admin) só pra platform_admin (system_role). Defesa em servidor — F1 commandbar 2026-05-27.';
;
