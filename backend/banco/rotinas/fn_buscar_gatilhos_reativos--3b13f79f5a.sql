CREATE OR REPLACE FUNCTION public.fn_buscar_gatilhos_reativos(p_tenant_id uuid, p_cargo_id uuid DEFAULT NULL::uuid, p_cenario text DEFAULT NULL::text, p_limite integer DEFAULT 50)
 RETURNS SETOF vw_gatilhos_reativos
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.vw_gatilhos_reativos v
  WHERE
    -- escopo: global (sem tenant) OU pertence ao tenant
    (v.tenant_id IS NULL OR v.tenant_id = p_tenant_id)
    AND (p_cargo_id IS NULL OR v.cargo_id IS NULL OR v.cargo_id = p_cargo_id)
    AND (p_cenario IS NULL OR v.cenario ILIKE p_cenario)
  ORDER BY
    -- prioridade: tenant-específico > nicho > global
    CASE WHEN v.tenant_id = p_tenant_id THEN 0
         WHEN v.nicho_id IS NOT NULL THEN 1
         ELSE 2 END,
    v.criado_em DESC
  LIMIT GREATEST(1, LEAST(p_limite, 200));
$function$

