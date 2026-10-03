CREATE OR REPLACE FUNCTION public.crenca_resumo_tenant(p_tenant_id uuid, p_dias integer DEFAULT 7)
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
    SELECT cb.proxima_intencao AS intencao,
           COUNT(*) AS total
    FROM public.crenca_conversa cb
    WHERE cb.tenant_id = p_tenant_id
      AND cb.updated_at > now() - (p_dias || ' days')::interval
      AND cb.proxima_intencao IS NOT NULL
    GROUP BY cb.proxima_intencao
    HAVING COUNT(*) >= 2
  ) t;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $function$

