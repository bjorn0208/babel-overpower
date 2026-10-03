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
;
