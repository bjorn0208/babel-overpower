-- 1) DROP RPCs antigas (escopo tenant)
DROP FUNCTION IF EXISTS public.backfill_tag_candidates(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.generate_tag_merge_suggestions(uuid, numeric, integer) CASCADE;
DROP FUNCTION IF EXISTS public.apply_tag_merge(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.revert_tag_merge(uuid) CASCADE;

-- 2) Adicionar nicho_id nas 3 tabelas (mantém tenant_id como informativo, NULLABLE)
ALTER TABLE public.tag_candidates
  ADD COLUMN IF NOT EXISTS nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE;
ALTER TABLE public.tag_candidates ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE public.tag_merge_suggestions
  ADD COLUMN IF NOT EXISTS nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE;
ALTER TABLE public.tag_merge_suggestions ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE public.tag_merge_log
  ADD COLUMN IF NOT EXISTS nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE;
ALTER TABLE public.tag_merge_log ALTER COLUMN tenant_id DROP NOT NULL;

-- Trocar UNIQUE de (tenant_id, tag_text) pra (nicho_id, tag_text)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tag_candidates_tenant_text_key') THEN
    ALTER TABLE public.tag_candidates DROP CONSTRAINT tag_candidates_tenant_text_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tag_candidates_nicho_text_key') THEN
    ALTER TABLE public.tag_candidates ADD CONSTRAINT tag_candidates_nicho_text_key UNIQUE (nicho_id, tag_text);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tag_candidates_nicho_status_idx
  ON public.tag_candidates (nicho_id, status)
  WHERE embedding IS NULL;

-- 3) Policies admin (platform_admin pode ler/escrever tudo via SECURITY DEFINER, mas pra UI direta:)
DROP POLICY IF EXISTS tag_candidates_admin_all ON public.tag_candidates;
CREATE POLICY tag_candidates_admin_all ON public.tag_candidates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

DROP POLICY IF EXISTS tag_merge_suggestions_admin_all ON public.tag_merge_suggestions;
CREATE POLICY tag_merge_suggestions_admin_all ON public.tag_merge_suggestions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

DROP POLICY IF EXISTS tag_merge_log_admin_all ON public.tag_merge_log;
CREATE POLICY tag_merge_log_admin_all ON public.tag_merge_log
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

-- 4) RPC: backfill por nicho (agrega leads de todos os tenants do nicho)
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
      'ativo',
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

-- 5) RPC: gerar sugestões por nicho via cosine similarity
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
  WHERE nicho_id = p_nicho_id AND status = 'pendente';

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

-- 6) Aplicar merge: substitui tag_origem por tag_destino em TODOS os leads dos tenants do nicho
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

  v_destino := COALESCE(p_canonical, v_sug.suggested_canonical);
  IF v_destino NOT IN (v_sug.tag_a, v_sug.tag_b) THEN
    RAISE EXCEPTION 'canonical deve ser tag_a ou tag_b';
  END IF;
  v_origem := CASE WHEN v_destino = v_sug.tag_a THEN v_sug.tag_b ELSE v_sug.tag_a END;

  -- UPDATE leads.tags em TODOS os tenants do nicho
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

  -- Atualiza tag_candidates do nicho
  UPDATE public.tag_candidates
  SET num_leads_independentes = num_leads_independentes
        + COALESCE((SELECT num_leads_independentes FROM public.tag_candidates WHERE nicho_id = v_sug.nicho_id AND tag_text = v_origem), 0),
      atualizado_em = now()
  WHERE nicho_id = v_sug.nicho_id AND tag_text = v_destino;

  DELETE FROM public.tag_candidates
  WHERE nicho_id = v_sug.nicho_id AND tag_text = v_origem;

  -- Atualiza observations dos tenants do nicho
  UPDATE public.tag_observations o
  SET tag_text = v_destino
  FROM public.profiles p
  WHERE p.id = o.tenant_id
    AND p.nicho_id = v_sug.nicho_id
    AND o.tag_text = v_origem;

  UPDATE public.tag_merge_suggestions
  SET status = 'aplicado', decided_at = now(), decided_by = v_user
  WHERE id = p_suggestion_id;

  INSERT INTO public.tag_merge_log
    (nicho_id, tag_origem, tag_destino, num_observacoes_movidas, applied_at, applied_by, origem_suggestion_id)
  VALUES
    (v_sug.nicho_id, v_origem, v_destino, v_leads_atualizados, now(), v_user, p_suggestion_id);

  RETURN v_leads_atualizados;
END;
$$;

-- 7) Reverter merge (90 dias)
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
    (v_log.nicho_id, v_log.tag_origem, v_log.num_observacoes_movidas, v_log.num_observacoes_movidas, ARRAY[]::uuid[], 'ativo', now(), now())
  ON CONFLICT (nicho_id, tag_text) DO UPDATE
    SET num_leads_independentes = EXCLUDED.num_leads_independentes,
        atualizado_em = now();

  UPDATE public.tag_merge_suggestions
  SET status = 'revertido', decided_at = now()
  WHERE id = v_log.origem_suggestion_id;

  DELETE FROM public.tag_merge_log WHERE id = p_log_id;

  RETURN v_revert;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_tag_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tag_merge_suggestions(uuid, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tag_merge(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_tag_merge(uuid) TO authenticated;
;
