CREATE OR REPLACE FUNCTION public.gerar_sugestoes_fusao_tag(p_nicho_id uuid, p_threshold numeric DEFAULT 0.85, p_min_leads integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_count integer := 0;
BEGIN
  IF p_nicho_id IS NULL THEN RAISE EXCEPTION 'nicho_id obrigatorio'; END IF;
  DELETE FROM public.sugestoes_fusao_tag WHERE nicho_id = p_nicho_id AND status IN ('pending','pendente');
  CREATE TEMP TABLE IF NOT EXISTS _pares (tag_a text, tag_b text, sim numeric) ON COMMIT DROP;
  TRUNCATE _pares;
  INSERT INTO _pares
  SELECT a.tag_text, b.tag_text, 1 - (a.vetor_semantico <=> b.vetor_semantico) AS sim
  FROM public.candidatos_tag a JOIN public.candidatos_tag b
    ON a.nicho_id = b.nicho_id AND a.tag_text < b.tag_text AND a.vetor_semantico IS NOT NULL AND b.vetor_semantico IS NOT NULL
  WHERE a.nicho_id = p_nicho_id AND a.num_leads_independentes >= p_min_leads AND b.num_leads_independentes >= p_min_leads
    AND 1 - (a.vetor_semantico <=> b.vetor_semantico) >= p_threshold;
  CREATE TEMP TABLE IF NOT EXISTS _vertices (tag text PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _vertices;
  INSERT INTO _vertices SELECT DISTINCT tag_a FROM _pares UNION SELECT DISTINCT tag_b FROM _pares;
  CREATE TEMP TABLE IF NOT EXISTS _arestas_bid (a text, b text) ON COMMIT DROP;
  TRUNCATE _arestas_bid;
  INSERT INTO _arestas_bid SELECT tag_a, tag_b FROM _pares
    UNION ALL SELECT tag_b, tag_a FROM _pares
    UNION ALL SELECT tag, tag FROM _vertices;
  CREATE TEMP TABLE IF NOT EXISTS _componentes (tag text PRIMARY KEY, root text) ON COMMIT DROP;
  TRUNCATE _componentes;
  WITH RECURSIVE alcanc AS (
    SELECT tag AS origem, tag AS atual FROM _vertices
    UNION SELECT al.origem, e.b FROM alcanc al JOIN _arestas_bid e ON e.a = al.atual
  )
  INSERT INTO _componentes SELECT origem, MIN(atual) FROM alcanc GROUP BY origem;
  INSERT INTO public.sugestoes_fusao_tag (nicho_id, tags, suggested_canonical, similarity, status, motivo, criado_em, tag_a, tag_b)
  SELECT p_nicho_id, cluster_tags, canonical, avg_sim, 'pendente',
    format('cluster=%s tags leads_canonica=%s', array_length(cluster_tags, 1), max_leads),
    now(), cluster_tags[1],
    CASE WHEN array_length(cluster_tags, 1) >= 2 THEN cluster_tags[2] ELSE cluster_tags[1] END
  FROM (
    SELECT c.root, array_agg(DISTINCT c.tag ORDER BY c.tag) AS cluster_tags,
      (SELECT tc.tag_text FROM public.candidatos_tag tc
       WHERE tc.nicho_id = p_nicho_id AND tc.tag_text = ANY(array_agg(DISTINCT c.tag))
       ORDER BY tc.num_leads_independentes DESC, tc.criado_em ASC LIMIT 1) AS canonical,
      (SELECT MAX(tc.num_leads_independentes) FROM public.candidatos_tag tc
       WHERE tc.nicho_id = p_nicho_id AND tc.tag_text = ANY(array_agg(DISTINCT c.tag))) AS max_leads,
      (SELECT COALESCE(AVG(p.sim), 0) FROM _pares p
       WHERE p.tag_a = ANY(array_agg(DISTINCT c.tag)) AND p.tag_b = ANY(array_agg(DISTINCT c.tag))) AS avg_sim
    FROM _componentes c GROUP BY c.root HAVING count(DISTINCT c.tag) >= 2
  ) clusters;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$

