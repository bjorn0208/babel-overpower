CREATE OR REPLACE FUNCTION public.clusterizar_tags_observadas(p_threshold numeric DEFAULT 0.85, p_min_obs integer DEFAULT 3, p_janela_dias integer DEFAULT 7)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_inseridas int := 0;
BEGIN
  WITH tags_frequentes AS (
    SELECT tenant_id, LOWER(TRIM(tag_text)) AS tag_norm, count(*)::int AS num_obs
    FROM public.observacoes_tag
    WHERE criado_em > now() - (p_janela_dias || ' days')::interval
    GROUP BY tenant_id, LOWER(TRIM(tag_text)) HAVING count(*) >= p_min_obs
  ),
  pares AS (
    SELECT a.tenant_id, a.tag_norm AS tag_a, b.tag_norm AS tag_b,
      extensions.similarity(a.tag_norm, b.tag_norm)::numeric(4,3) AS sim,
      CASE WHEN a.num_obs >= b.num_obs THEN a.tag_norm ELSE b.tag_norm END AS canonical
    FROM tags_frequentes a JOIN tags_frequentes b ON a.tenant_id = b.tenant_id AND a.tag_norm < b.tag_norm
    WHERE extensions.similarity(a.tag_norm, b.tag_norm) >= p_threshold
  ),
  inseridos AS (
    INSERT INTO public.sugestoes_fusao_tag (tenant_id, tag_a, tag_b, similarity, suggested_canonical, status, motivo)
    SELECT tenant_id, tag_a, tag_b, sim, canonical, 'pendente', 'cron-clusterizar-tags trgm' FROM pares
    ON CONFLICT DO NOTHING RETURNING id
  )
  SELECT count(*) INTO v_inseridas FROM inseridos;
  RETURN v_inseridas;
END;
$function$

