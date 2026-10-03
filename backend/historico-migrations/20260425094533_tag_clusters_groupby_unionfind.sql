-- 1) Adicionar coluna tags[] em tag_merge_suggestions (cluster N-tags)
ALTER TABLE public.tag_merge_suggestions
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- Tornar tag_a/tag_b opcionais (compat: sugestões antigas em par continuam)
ALTER TABLE public.tag_merge_suggestions ALTER COLUMN tag_a DROP NOT NULL;
ALTER TABLE public.tag_merge_suggestions ALTER COLUMN tag_b DROP NOT NULL;

-- 2) Refator generate: union-find pra gerar 1 sugestão por componente conexo
CREATE OR REPLACE FUNCTION public.generate_tag_merge_suggestions(
  p_nicho_id uuid,
  p_threshold numeric DEFAULT 0.85,
  p_min_leads integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_nicho_id IS NULL THEN
    RAISE EXCEPTION 'nicho_id obrigatorio';
  END IF;

  DELETE FROM public.tag_merge_suggestions
  WHERE nicho_id = p_nicho_id AND status = 'pending';

  -- 2.1 Coleta pares acima do threshold
  CREATE TEMP TABLE IF NOT EXISTS _pares (
    tag_a text,
    tag_b text,
    sim numeric
  ) ON COMMIT DROP;
  TRUNCATE _pares;

  INSERT INTO _pares
  SELECT
    a.tag_text,
    b.tag_text,
    1 - (a.embedding <=> b.embedding) AS sim
  FROM public.tag_candidates a
  JOIN public.tag_candidates b
    ON a.nicho_id = b.nicho_id
   AND a.tag_text < b.tag_text
   AND a.embedding IS NOT NULL
   AND b.embedding IS NOT NULL
  WHERE a.nicho_id = p_nicho_id
    AND a.num_leads_independentes >= p_min_leads
    AND b.num_leads_independentes >= p_min_leads
    AND 1 - (a.embedding <=> b.embedding) >= p_threshold;

  -- 2.2 Union-find via recursive CTE: tags conectadas pelos pares
  CREATE TEMP TABLE IF NOT EXISTS _vertices (tag text PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _vertices;
  INSERT INTO _vertices SELECT DISTINCT tag_a FROM _pares
    UNION SELECT DISTINCT tag_b FROM _pares;

  -- Encontra componente conexo: para cada vértice, o menor texto alcançável.
  CREATE TEMP TABLE IF NOT EXISTS _arestas_bid (a text, b text) ON COMMIT DROP;
  TRUNCATE _arestas_bid;
  INSERT INTO _arestas_bid SELECT tag_a, tag_b FROM _pares
    UNION ALL SELECT tag_b, tag_a FROM _pares
    UNION ALL SELECT tag, tag FROM _vertices;

  CREATE TEMP TABLE IF NOT EXISTS _componentes (tag text PRIMARY KEY, root text) ON COMMIT DROP;
  TRUNCATE _componentes;

  WITH RECURSIVE alcanc AS (
    SELECT tag AS origem, tag AS atual FROM _vertices
    UNION
    SELECT al.origem, e.b FROM alcanc al JOIN _arestas_bid e ON e.a = al.atual
  )
  INSERT INTO _componentes
  SELECT origem, MIN(atual) FROM alcanc GROUP BY origem;

  -- 2.3 Pra cada componente: monta cluster (tags + canonical = a com mais leads)
  INSERT INTO public.tag_merge_suggestions
    (nicho_id, tags, suggested_canonical, similarity, status, motivo, criado_em, tag_a, tag_b)
  SELECT
    p_nicho_id,
    cluster_tags,
    canonical,
    avg_sim,
    'pending',
    format('cluster=%s tags leads_canonica=%s', array_length(cluster_tags, 1), max_leads),
    now(),
    cluster_tags[1],
    CASE WHEN array_length(cluster_tags, 1) >= 2 THEN cluster_tags[2] ELSE cluster_tags[1] END
  FROM (
    SELECT
      c.root,
      array_agg(DISTINCT c.tag ORDER BY c.tag) AS cluster_tags,
      (SELECT tc.tag_text
       FROM public.tag_candidates tc
       WHERE tc.nicho_id = p_nicho_id AND tc.tag_text = ANY(array_agg(DISTINCT c.tag))
       ORDER BY tc.num_leads_independentes DESC, tc.criado_em ASC
       LIMIT 1) AS canonical,
      (SELECT MAX(tc.num_leads_independentes)
       FROM public.tag_candidates tc
       WHERE tc.nicho_id = p_nicho_id AND tc.tag_text = ANY(array_agg(DISTINCT c.tag))) AS max_leads,
      (SELECT COALESCE(AVG(p.sim), 0)
       FROM _pares p
       WHERE p.tag_a = ANY(array_agg(DISTINCT c.tag)) AND p.tag_b = ANY(array_agg(DISTINCT c.tag))) AS avg_sim
    FROM _componentes c
    GROUP BY c.root
    HAVING count(DISTINCT c.tag) >= 2
  ) clusters;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 3) Refator apply_tag_merge: aceita lista de origens
CREATE OR REPLACE FUNCTION public.apply_tag_merge(
  p_suggestion_id uuid,
  p_canonical text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_sug      public.tag_merge_suggestions%ROWTYPE;
  v_destino  text;
  v_origens  text[];
  v_origem   text;
  v_leads_atualizados integer := 0;
  v_total integer := 0;
  v_user     uuid;
BEGIN
  v_user := auth.uid();

  SELECT * INTO v_sug FROM public.tag_merge_suggestions WHERE id = p_suggestion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sugestao nao encontrada';
  END IF;

  IF v_sug.status <> 'pending' THEN
    RAISE EXCEPTION 'sugestao ja decidida (status=%)', v_sug.status;
  END IF;

  v_destino := COALESCE(p_canonical, v_sug.suggested_canonical);

  -- Lista de origens = tags do cluster menos a canônica
  IF v_sug.tags IS NOT NULL AND array_length(v_sug.tags, 1) > 0 THEN
    v_origens := array(SELECT t FROM unnest(v_sug.tags) t WHERE t <> v_destino);
  ELSE
    -- Compat com sugestões em par
    v_origens := array(SELECT t FROM unnest(ARRAY[v_sug.tag_a, v_sug.tag_b]) t WHERE t <> v_destino AND t IS NOT NULL);
  END IF;

  IF array_length(v_origens, 1) IS NULL OR array_length(v_origens, 1) = 0 THEN
    RAISE EXCEPTION 'nenhuma tag origem (canonical %s sozinha?)', v_destino;
  END IF;

  -- Pra cada origem: UPDATE leads, atualiza candidates, observations, log
  FOREACH v_origem IN ARRAY v_origens LOOP
    WITH afetados AS (
      UPDATE public.leads
      SET tags = (
        SELECT array_agg(DISTINCT t)
        FROM (
          SELECT CASE WHEN x = v_origem THEN v_destino ELSE x END AS t
          FROM unnest(tags) x
        ) z
      )
      FROM public.profiles p
      WHERE p.id = public.leads.tenant_id
        AND p.nicho_id = v_sug.nicho_id
        AND public.leads.tags @> ARRAY[v_origem]
      RETURNING public.leads.id
    )
    SELECT count(*) INTO v_leads_atualizados FROM afetados;

    UPDATE public.tag_candidates
    SET num_leads_independentes = num_leads_independentes
          + COALESCE((SELECT num_leads_independentes FROM public.tag_candidates WHERE nicho_id = v_sug.nicho_id AND tag_text = v_origem), 0),
        atualizado_em = now()
    WHERE nicho_id = v_sug.nicho_id AND tag_text = v_destino;

    DELETE FROM public.tag_candidates
    WHERE nicho_id = v_sug.nicho_id AND tag_text = v_origem;

    UPDATE public.tag_observations o
    SET tag_text = v_destino
    FROM public.profiles p
    WHERE p.id = o.tenant_id
      AND p.nicho_id = v_sug.nicho_id
      AND o.tag_text = v_origem;

    INSERT INTO public.tag_merge_log
      (nicho_id, tag_origem, tag_destino, num_observacoes_movidas, applied_at, applied_by, origem_suggestion_id)
    VALUES
      (v_sug.nicho_id, v_origem, v_destino, v_leads_atualizados, now(), v_user, p_suggestion_id);

    v_total := v_total + v_leads_atualizados;
  END LOOP;

  UPDATE public.tag_merge_suggestions
  SET status = 'approved', decided_at = now(), decided_by = v_user
  WHERE id = p_suggestion_id;

  RETURN v_total;
END;
$$;
;
