CREATE OR REPLACE FUNCTION public.falhas_agrupadas_periodo(p_dias integer DEFAULT 7, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  SELECT coalesce(jsonb_agg(t ORDER BY t.total DESC), '[]'::jsonb)
  INTO v_resultado
  FROM (
    SELECT motivo_falha,
           COUNT(*) AS total,
           array_agg(DISTINCT tenant_id) FILTER (WHERE tenant_id IS NOT NULL) AS tenants,
           array_agg(DISTINCT licao_gerada) FILTER (WHERE licao_gerada IS NOT NULL) AS licoes_geradas
    FROM public.registro_reflexao
    WHERE criado_em > now() - (p_dias || ' days')::interval
      AND deleted_at IS NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY motivo_falha
    HAVING COUNT(*) >= 3
  ) t;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $function$

