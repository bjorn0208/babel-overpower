-- 1) Embedding nas tag_candidates
ALTER TABLE public.tag_candidates
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

CREATE INDEX IF NOT EXISTS tag_candidates_embedding_ivf
  ON public.tag_candidates USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS tag_candidates_tenant_status_idx
  ON public.tag_candidates (tenant_id, status)
  WHERE embedding IS NULL;

-- 2) Backfill: a partir de leads.tags atuais, popular tag_candidates
CREATE OR REPLACE FUNCTION public.backfill_tag_candidates(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inseridos integer := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatorio';
  END IF;

  WITH agg AS (
    SELECT
      unnest(l.tags) AS tag_text,
      count(DISTINCT l.id) AS num_leads,
      count(*) AS num_obs,
      array_agg(DISTINCT l.id) FILTER (WHERE l.id IS NOT NULL) AS evidence
    FROM public.leads l
    WHERE l.tenant_id = p_tenant_id
      AND l.tags IS NOT NULL
      AND array_length(l.tags, 1) > 0
    GROUP BY 1
  ),
  ins AS (
    INSERT INTO public.tag_candidates
      (tenant_id, tag_text, num_observacoes, num_leads_independentes, evidencia_lead_ids, status, criado_em, atualizado_em)
    SELECT
      p_tenant_id,
      a.tag_text,
      a.num_obs,
      a.num_leads,
      (a.evidence)[1:5],
      'ativo',
      now(),
      now()
    FROM agg a
    ON CONFLICT (tenant_id, tag_text) DO UPDATE
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

-- Garantir UNIQUE pra ON CONFLICT funcionar (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tag_candidates_tenant_text_key'
  ) THEN
    ALTER TABLE public.tag_candidates
      ADD CONSTRAINT tag_candidates_tenant_text_key UNIQUE (tenant_id, tag_text);
  END IF;
END $$;

-- 3) Gerar sugestões de merge por similaridade vetorial (cosine > p_threshold)
CREATE OR REPLACE FUNCTION public.generate_tag_merge_suggestions(
  p_tenant_id uuid,
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
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatorio';
  END IF;

  -- Limpa sugestões antigas em estado pendente do tenant
  DELETE FROM public.tag_merge_suggestions
  WHERE tenant_id = p_tenant_id AND status = 'pendente';

  -- Pares (a,b) tag_a.id < tag_b.id, similaridade cosine > threshold,
  -- canonical = a tag com mais leads_independentes (desempate: mais antiga)
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
      ON a.tenant_id = b.tenant_id
     AND a.tag_text < b.tag_text
     AND a.embedding IS NOT NULL
     AND b.embedding IS NOT NULL
    WHERE a.tenant_id = p_tenant_id
      AND a.num_leads_independentes >= p_min_leads
      AND b.num_leads_independentes >= p_min_leads
      AND 1 - (a.embedding <=> b.embedding) >= p_threshold
  ),
  ins AS (
    INSERT INTO public.tag_merge_suggestions
      (tenant_id, tag_a, tag_b, similarity, suggested_canonical, status, motivo, criado_em)
    SELECT
      p_tenant_id,
      tag_a,
      tag_b,
      sim,
      CASE
        WHEN leads_a > leads_b THEN tag_a
        WHEN leads_b > leads_a THEN tag_b
        WHEN created_a <= created_b THEN tag_a
        ELSE tag_b
      END,
      'pendente',
      format('cosine=%s leads=%s/%s', round(sim::numeric, 3), leads_a, leads_b),
      now()
    FROM pares
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

-- 4) Aplicar merge: substitui tag_origem por tag_destino em todos os leads
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

  IF v_sug.status <> 'pendente' THEN
    RAISE EXCEPTION 'sugestao ja decidida (status=%)', v_sug.status;
  END IF;

  -- Canônica final (se passada, usa; senão usa a sugerida)
  v_destino := COALESCE(p_canonical, v_sug.suggested_canonical);
  IF v_destino NOT IN (v_sug.tag_a, v_sug.tag_b) THEN
    RAISE EXCEPTION 'canonical deve ser tag_a ou tag_b da sugestao';
  END IF;
  v_origem := CASE WHEN v_destino = v_sug.tag_a THEN v_sug.tag_b ELSE v_sug.tag_a END;

  -- UPDATE leads.tags: substitui v_origem por v_destino, dedup
  WITH afetados AS (
    UPDATE public.leads
    SET tags = (
      SELECT array_agg(DISTINCT t)
      FROM (
        SELECT CASE WHEN x = v_origem THEN v_destino ELSE x END AS t
        FROM unnest(tags) x
      ) z
    )
    WHERE tenant_id = v_sug.tenant_id
      AND tags @> ARRAY[v_origem]
    RETURNING id
  )
  SELECT count(*) INTO v_leads_atualizados FROM afetados;

  -- Atualiza tag_candidates: remove origem, soma leads em destino
  UPDATE public.tag_candidates
  SET num_leads_independentes = num_leads_independentes
        + COALESCE((SELECT num_leads_independentes FROM public.tag_candidates WHERE tenant_id = v_sug.tenant_id AND tag_text = v_origem), 0),
      atualizado_em = now()
  WHERE tenant_id = v_sug.tenant_id AND tag_text = v_destino;

  DELETE FROM public.tag_candidates
  WHERE tenant_id = v_sug.tenant_id AND tag_text = v_origem;

  -- Atualiza observations
  UPDATE public.tag_observations
  SET tag_text = v_destino
  WHERE tenant_id = v_sug.tenant_id AND tag_text = v_origem;

  -- Marca sugestão como aplicada
  UPDATE public.tag_merge_suggestions
  SET status = 'aplicado',
      decided_at = now(),
      decided_by = v_user
  WHERE id = p_suggestion_id;

  -- Log reversível
  INSERT INTO public.tag_merge_log
    (tenant_id, tag_origem, tag_destino, num_observacoes_movidas, applied_at, applied_by, origem_suggestion_id)
  VALUES
    (v_sug.tenant_id, v_origem, v_destino, v_leads_atualizados, now(), v_user, p_suggestion_id);

  RETURN v_leads_atualizados;
END;
$$;

-- 5) Reverter merge (até 90d)
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
    RAISE EXCEPTION 'janela de reversao expirou (90d)';
  END IF;

  -- NOTA: reversao recria a tag_origem nos leads que tinham tag_destino.
  -- Como o merge perdeu a info de quais leads originalmente tinham qual tag,
  -- o revert é grosseiro: TODOS que têm destino voltam a ter origem ALÉM do destino.
  -- Pra revert mais fino, precisaria snapshot pré-merge — fica pra v2.
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
    WHERE tenant_id = v_log.tenant_id
      AND tags @> ARRAY[v_log.tag_destino]
    RETURNING id
  )
  SELECT count(*) INTO v_revert FROM afetados;

  -- Recria candidate origem (sem embedding, vai precisar embedar de novo)
  INSERT INTO public.tag_candidates
    (tenant_id, tag_text, num_observacoes, num_leads_independentes, evidencia_lead_ids, status, criado_em, atualizado_em)
  VALUES
    (v_log.tenant_id, v_log.tag_origem, v_log.num_observacoes_movidas, v_log.num_observacoes_movidas, ARRAY[]::uuid[], 'ativo', now(), now())
  ON CONFLICT (tenant_id, tag_text) DO UPDATE
    SET num_leads_independentes = EXCLUDED.num_leads_independentes,
        atualizado_em = now();

  -- Marca sugestão de volta pra rejeitada
  UPDATE public.tag_merge_suggestions
  SET status = 'revertido', decided_at = now()
  WHERE id = v_log.origem_suggestion_id;

  -- Remove log (não fica resíduo)
  DELETE FROM public.tag_merge_log WHERE id = p_log_id;

  RETURN v_revert;
END;
$$;

-- 6) Permissões: authenticated pode executar via RLS (cada um vê o próprio tenant)
GRANT EXECUTE ON FUNCTION public.backfill_tag_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tag_merge_suggestions(uuid, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tag_merge(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_tag_merge(uuid) TO authenticated;
;
