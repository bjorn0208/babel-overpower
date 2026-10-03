CREATE OR REPLACE FUNCTION public.admin_ia_custo_mes_corrente()
RETURNS TABLE(custo_total numeric, custo_llm numeric, custo_embed numeric, custo_rerank numeric, total_chamadas bigint, inicio_mes timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_inicio timestamptz := date_trunc('month', now());
BEGIN
  RETURN QUERY
  SELECT
    coalesce(sum(l.custo_total), 0)::numeric AS custo_total,
    coalesce(sum(l.custo_total) FILTER (WHERE l.tipo = 'admin_ia_chat'), 0)::numeric AS custo_llm,
    coalesce(sum(l.custo_total) FILTER (WHERE l.tipo IN ('embed_chunk','embed_query') AND l.metadata->>'origem' = 'admin_ia'), 0)::numeric AS custo_embed,
    coalesce(sum(l.custo_total) FILTER (WHERE l.tipo = 'admin_ia_rerank'), 0)::numeric AS custo_rerank,
    count(*) FILTER (WHERE l.tipo LIKE 'admin_ia%' OR (l.tipo IN ('embed_chunk','embed_query') AND l.metadata->>'origem' = 'admin_ia'))::bigint AS total_chamadas,
    v_inicio AS inicio_mes
  FROM public.llm_request_logs l
  WHERE l.created_at >= v_inicio;
END;
$function$;
;
