CREATE OR REPLACE FUNCTION public.backfill_tag_candidates(p_nicho_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inseridos integer := 0;
BEGIN
  IF p_nicho_id IS NULL THEN
    RAISE EXCEPTION 'nicho_id obrigatorio';
  END IF;

  WITH agg AS (
    SELECT
      unnest(l.tags) AS tag_text,
      count(DISTINCT l.id) AS num_leads,
      count(*) AS num_obs,
      array_agg(DISTINCT l.id) FILTER (WHERE l.id IS NOT NULL) AS evidence
    FROM public.leads l
    JOIN public.profiles p ON p.id = l.tenant_id
    WHERE p.nicho_id = p_nicho_id
      AND l.tags IS NOT NULL
      AND array_length(l.tags, 1) > 0
    GROUP BY 1
  ),
  ins AS (
    INSERT INTO public.tag_candidates
      (nicho_id, tag_text, num_observacoes, num_leads_independentes, evidencia_lead_ids, status, criado_em, atualizado_em)
    SELECT
      p_nicho_id,
      a.tag_text,
      a.num_obs,
      a.num_leads,
      (a.evidence)[1:5],
      'pending',
      now(),
      now()
    FROM agg a
    ON CONFLICT (nicho_id, tag_text) DO UPDATE
      SET num_observacoes        = EXCLUDED.num_observacoes,
          num_leads_independentes = EXCLUDED.num_leads_independentes,
          evidencia_lead_ids      = EXCLUDED.evidencia_lead_ids,
          atualizado_em           = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_inseridos FROM ins;

  RETURN v_inseridos;
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_tag_merge(p_log_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_log    public.tag_merge_log%ROWTYPE;
  v_revert integer := 0;
BEGIN
  SELECT * INTO v_log FROM public.tag_merge_log WHERE id = p_log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'log nao encontrado';
  END IF;

  IF v_log.applied_at < now() - interval '90 days' THEN
    RAISE EXCEPTION 'janela de 90 dias expirou';
  END IF;

  WITH afetados AS (
    UPDATE public.leads
    SET tags = (
      SELECT array_agg(DISTINCT t)
      FROM (
        SELECT unnest(tags) AS t
        UNION
        SELECT v_log.tag_origem
      ) z
    )
    FROM public.profiles p
    WHERE p.id = public.leads.tenant_id
      AND p.nicho_id = v_log.nicho_id
      AND public.leads.tags @> ARRAY[v_log.tag_destino]
    RETURNING public.leads.id
  )
  SELECT count(*) INTO v_revert FROM afetados;

  INSERT INTO public.tag_candidates
    (nicho_id, tag_text, num_observacoes, num_leads_independentes, evidencia_lead_ids, status, criado_em, atualizado_em)
  VALUES
    (v_log.nicho_id, v_log.tag_origem, v_log.num_observacoes_movidas, v_log.num_observacoes_movidas, ARRAY[]::uuid[], 'pending', now(), now())
  ON CONFLICT (nicho_id, tag_text) DO UPDATE
    SET num_leads_independentes = EXCLUDED.num_leads_independentes,
        atualizado_em = now();

  UPDATE public.tag_merge_suggestions
  SET status = 'rejected', decided_at = now()
  WHERE id = v_log.origem_suggestion_id;

  DELETE FROM public.tag_merge_log WHERE id = p_log_id;

  RETURN v_revert;
END;
$$;
;
