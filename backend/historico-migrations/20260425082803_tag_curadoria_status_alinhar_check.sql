CREATE OR REPLACE FUNCTION public.generate_tag_merge_suggestions(
  p_nicho_id uuid,
  p_threshold numeric DEFAULT 0.85,
  p_min_leads integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_nicho_id IS NULL THEN
    RAISE EXCEPTION 'nicho_id obrigatorio';
  END IF;

  DELETE FROM public.tag_merge_suggestions
  WHERE nicho_id = p_nicho_id AND status = 'pending';

  WITH pares AS (
    SELECT
      a.tag_text AS tag_a,
      b.tag_text AS tag_b,
      a.num_leads_independentes AS leads_a,
      b.num_leads_independentes AS leads_b,
      a.criado_em AS created_a,
      b.criado_em AS created_b,
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
      AND 1 - (a.embedding <=> b.embedding) >= p_threshold
  ),
  ins AS (
    INSERT INTO public.tag_merge_suggestions
      (nicho_id, tag_a, tag_b, similarity, suggested_canonical, status, motivo, criado_em)
    SELECT
      p_nicho_id,
      tag_a,
      tag_b,
      sim,
      CASE
        WHEN leads_a > leads_b THEN tag_a
        WHEN leads_b > leads_a THEN tag_b
        WHEN created_a <= created_b THEN tag_a
        ELSE tag_b
      END,
      'pending',
      format('cosine=%s leads=%s/%s', round(sim::numeric, 3), leads_a, leads_b),
      now()
    FROM pares
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_tag_merge(
  p_suggestion_id uuid,
  p_canonical text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sug      public.tag_merge_suggestions%ROWTYPE;
  v_origem   text;
  v_destino  text;
  v_leads_atualizados integer := 0;
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
  IF v_destino NOT IN (v_sug.tag_a, v_sug.tag_b) THEN
    RAISE EXCEPTION 'canonical deve ser tag_a ou tag_b';
  END IF;
  v_origem := CASE WHEN v_destino = v_sug.tag_a THEN v_sug.tag_b ELSE v_sug.tag_a END;

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

  UPDATE public.tag_merge_suggestions
  SET status = 'approved', decided_at = now(), decided_by = v_user
  WHERE id = p_suggestion_id;

  INSERT INTO public.tag_merge_log
    (nicho_id, tag_origem, tag_destino, num_observacoes_movidas, applied_at, applied_by, origem_suggestion_id)
  VALUES
    (v_sug.nicho_id, v_origem, v_destino, v_leads_atualizados, now(), v_user, p_suggestion_id);

  RETURN v_leads_atualizados;
END;
$$;
;
