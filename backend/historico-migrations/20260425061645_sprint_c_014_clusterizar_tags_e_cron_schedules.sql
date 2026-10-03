
-- Sprint C · Migration 014 · clusterizar_tags + 3 cron schedules

-- 1) RPC clusterizar_tags_observadas (SQL puro via pg_trgm similarity)
CREATE OR REPLACE FUNCTION public.clusterizar_tags_observadas(
  p_threshold numeric DEFAULT 0.85,
  p_min_obs int DEFAULT 3,
  p_janela_dias int DEFAULT 7
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inseridas int := 0;
BEGIN
  WITH tags_frequentes AS (
    SELECT
      tenant_id,
      LOWER(TRIM(tag_text)) AS tag_norm,
      count(*)::int AS num_obs
    FROM public.tag_observations
    WHERE criado_em > now() - (p_janela_dias || ' days')::interval
    GROUP BY tenant_id, LOWER(TRIM(tag_text))
    HAVING count(*) >= p_min_obs
  ),
  pares AS (
    SELECT
      a.tenant_id,
      a.tag_norm AS tag_a,
      b.tag_norm AS tag_b,
      extensions.similarity(a.tag_norm, b.tag_norm)::numeric(4,3) AS sim,
      CASE WHEN a.num_obs >= b.num_obs THEN a.tag_norm ELSE b.tag_norm END AS canonical
    FROM tags_frequentes a
    JOIN tags_frequentes b
      ON a.tenant_id = b.tenant_id
     AND a.tag_norm < b.tag_norm
    WHERE extensions.similarity(a.tag_norm, b.tag_norm) >= p_threshold
  ),
  inseridos AS (
    INSERT INTO public.tag_merge_suggestions
      (tenant_id, tag_a, tag_b, similarity, suggested_canonical, status, motivo)
    SELECT tenant_id, tag_a, tag_b, sim, canonical, 'pending', 'cron-clusterizar-tags trgm'
    FROM pares
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_inseridas FROM inseridos;

  RETURN v_inseridas;
END;
$$;

REVOKE ALL ON FUNCTION public.clusterizar_tags_observadas(numeric, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clusterizar_tags_observadas(numeric, int, int) TO service_role;

COMMENT ON FUNCTION public.clusterizar_tags_observadas IS 'Sprint C: agrupa tag_observations similares via pg_trgm, insere sugestões em tag_merge_suggestions. Cron clusterizar-tags semanal.';

-- 2) Garante extensão pg_trgm (pode já estar instalada)
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- 3) Cron schedules — UTC sempre
-- Limpa schedules antigas com mesmo nome (idempotência)
DO $$ BEGIN
  PERFORM cron.unschedule('cron-decay-episodios');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('cron-promover-meta-chunks');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('cron-clusterizar-tags');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'cron-decay-episodios',
  '0 3 * * *',  -- diário 03:00 UTC
  $$SELECT public.decay_episodios(0.02, 0.05);$$
);

SELECT cron.schedule(
  'cron-promover-meta-chunks',
  '0 4 * * 1',  -- segunda 04:00 UTC
  $$SELECT public.promover_meta_chunks_estaveis(10, 7);$$
);

SELECT cron.schedule(
  'cron-clusterizar-tags',
  '0 5 * * 3',  -- quarta 05:00 UTC
  $$SELECT public.clusterizar_tags_observadas(0.85, 3, 7);$$
);

;
