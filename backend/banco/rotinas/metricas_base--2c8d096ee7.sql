CREATE OR REPLACE FUNCTION public.metricas_base(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_admin boolean := public.is_platform_admin();
  v_team boolean;
  v_total integer;
  v_leads integer;
  v_clientes integer;
  v_top_produto text;
  v_distribuicao_tags jsonb;
  v_distribuicao_meses jsonb;
  v_total_consumido numeric;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_caller AND parent_user_id = p_tenant_id
  ) INTO v_team;
  IF NOT (p_tenant_id = v_caller OR v_admin OR v_team) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE converted_at IS NULL),
         COUNT(*) FILTER (WHERE converted_at IS NOT NULL)
    INTO v_total, v_leads, v_clientes
    FROM public.leads
   WHERE tenant_id = p_tenant_id
     AND location = 'base'
     AND deleted_at IS NULL;

  SELECT product INTO v_top_produto
    FROM public.leads
   WHERE tenant_id = p_tenant_id
     AND location = 'base'
     AND deleted_at IS NULL
     AND product IS NOT NULL
   GROUP BY product
   ORDER BY COUNT(*) DESC
   LIMIT 1;

  SELECT COALESCE(jsonb_object_agg(tag, qtd), '{}'::jsonb)
    INTO v_distribuicao_tags
  FROM (
    SELECT unnest(tags) AS tag, COUNT(*) AS qtd
      FROM public.leads
     WHERE tenant_id = p_tenant_id
       AND location = 'base'
       AND deleted_at IS NULL
       AND tags IS NOT NULL
     GROUP BY tag
     ORDER BY qtd DESC
     LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_object_agg(mes, qtd), '{}'::jsonb)
    INTO v_distribuicao_meses
  FROM (
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS mes,
           COUNT(*) AS qtd
      FROM public.leads
     WHERE tenant_id = p_tenant_id
       AND location = 'base'
       AND deleted_at IS NULL
     GROUP BY mes
     ORDER BY mes DESC
     LIMIT 12
  ) m;

  SELECT COALESCE(SUM(cp.valor), 0)
    INTO v_total_consumido
    FROM public.pagamentos_cliente cp
    JOIN public.leads l ON l.id = cp.lead_id
   WHERE l.tenant_id = p_tenant_id
     AND l.location = 'base'
     AND l.converted_at IS NOT NULL
     AND l.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'total', v_total,
    'leads', v_leads,
    'clientes', v_clientes,
    'produto_mais_vendido', v_top_produto,
    'distribuicao_tags', v_distribuicao_tags,
    'distribuicao_temporal_meses', v_distribuicao_meses,
    'total_consumido_clientes', v_total_consumido
  );
END;
$function$

