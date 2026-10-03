CREATE OR REPLACE FUNCTION public.promover_meta_blocos_estaveis(p_min_usos integer DEFAULT 10, p_janela_dias integer DEFAULT 7)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_promovidos int := 0;
BEGIN
  WITH usos_por_chunk AS (
    SELECT
      jsonb_array_elements_text(coalesce(metadata->'planejador'->'meta_consultados', '[]'::jsonb))::uuid AS meta_id,
      count(*) FILTER (
        WHERE coalesce(metadata->'verificador'->>'ok','true') <> 'false'
      ) AS usos_validos
    FROM public.logs_requisicao_llm
    WHERE created_at > now() - (p_janela_dias || ' days')::interval
      AND metadata ? 'planejador'
    GROUP BY jsonb_array_elements_text(coalesce(metadata->'planejador'->'meta_consultados', '[]'::jsonb))
  ),
  promocoes AS (
    UPDATE public.blocos_meta mc
       SET stability_tier = 'promovido',
           updated_at = now()
      FROM usos_por_chunk u
     WHERE mc.id = u.meta_id
       AND mc.stability_tier = 'experimental'
       AND u.usos_validos >= p_min_usos
    RETURNING mc.id
  )
  SELECT count(*) INTO v_promovidos FROM promocoes;

  RETURN v_promovidos;
END;
$function$

