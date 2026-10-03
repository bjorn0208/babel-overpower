CREATE OR REPLACE FUNCTION public.rpc_metricas_motor(_tenant_id uuid DEFAULT NULL::uuid, _dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _resultado jsonb;
BEGIN
  SELECT jsonb_build_object(
    'periodo_dias', _dias,
    'tenant_id', _tenant_id,
    'gerado_em', now(),
    'totais_traces', (
      SELECT jsonb_build_object(
        'eventos', count(*),
        'tokens_in', coalesce(sum(custo_tokens_in), 0),
        'tokens_out', coalesce(sum(custo_tokens_out), 0),
        'p95_latencia_ms', percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia_ms)::integer
      )
      FROM public.traces
      WHERE criado_em >= now() - (_dias || ' days')::interval
        AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
    ),
    'ferramentas', (
      SELECT jsonb_agg(jsonb_build_object(
        'nome', tool_name,
        'sucessos', sucessos,
        'falhas', falhas
      ))
      FROM (
        SELECT tool_name,
          count(*) FILTER (WHERE status = 'sucesso') AS sucessos,
          count(*) FILTER (WHERE status <> 'sucesso') AS falhas
        FROM public.invocacoes_ferramenta
        WHERE criado_em >= now() - (_dias || ' days')::interval
          AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
        GROUP BY tool_name ORDER BY count(*) DESC LIMIT 20
      ) t
    ),
    'saude_filas', (SELECT jsonb_agg(to_jsonb(s)) FROM public.fn_saude_motor() s)
  ) INTO _resultado;
  RETURN _resultado;
END;
$function$

