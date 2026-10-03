CREATE OR REPLACE FUNCTION public.cronjobs_saude(p_dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  SELECT coalesce(jsonb_agg(t ORDER BY t.execucoes DESC), '[]'::jsonb)
  INTO v_resultado
  FROM (
    SELECT cronjob_nome,
           COUNT(*) AS execucoes,
           COUNT(*) FILTER (WHERE resultado='sucesso') AS sucessos,
           COUNT(*) FILTER (WHERE resultado='erro') AS erros,
           MAX(iniciou_em) AS ultima
    FROM public.agendamentos_log
    WHERE iniciou_em > now() - (p_dias || ' days')::interval
    GROUP BY cronjob_nome
  ) t;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $function$

