CREATE OR REPLACE FUNCTION public.tags_disponiveis_base(p_tenant_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_admin boolean := public.is_platform_admin();
  v_team boolean;
  v_tags text[];
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_caller AND parent_user_id = p_tenant_id
  ) INTO v_team;
  IF NOT (p_tenant_id = v_caller OR v_admin OR v_team) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT tag ORDER BY tag), ARRAY[]::text[])
    INTO v_tags
  FROM (
    SELECT unnest(tags) AS tag
      FROM public.leads
     WHERE tenant_id = p_tenant_id
       AND deleted_at IS NULL
       AND tags IS NOT NULL
  ) t;
  RETURN v_tags;
END;
$function$

