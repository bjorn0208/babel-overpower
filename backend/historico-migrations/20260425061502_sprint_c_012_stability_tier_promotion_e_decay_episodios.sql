
-- Sprint C · Migration 012 · RPCs auxiliares pros crons (decay + promotion)

-- 1) promover_meta_chunks_estaveis
CREATE OR REPLACE FUNCTION public.promover_meta_chunks_estaveis(
  p_min_usos int DEFAULT 10,
  p_janela_dias int DEFAULT 7
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_promovidos int := 0;
BEGIN
  WITH usos_por_chunk AS (
    SELECT
      jsonb_array_elements_text(coalesce(metadata->'planejador'->'meta_consultados', '[]'::jsonb))::uuid AS meta_id,
      count(*) FILTER (
        WHERE coalesce(metadata->'verificador'->>'ok','true') <> 'false'
      ) AS usos_validos
    FROM public.llm_request_logs
    WHERE created_at > now() - (p_janela_dias || ' days')::interval
      AND metadata ? 'planejador'
    GROUP BY jsonb_array_elements_text(coalesce(metadata->'planejador'->'meta_consultados', '[]'::jsonb))
  ),
  promocoes AS (
    UPDATE public.meta_chunks mc
       SET stability_tier = 'promovido',
           atualizado_em = now()
      FROM usos_por_chunk u
     WHERE mc.id = u.meta_id
       AND mc.stability_tier = 'experimental'
       AND u.usos_validos >= p_min_usos
    RETURNING mc.id
  )
  SELECT count(*) INTO v_promovidos FROM promocoes;

  RETURN v_promovidos;
END;
$$;

REVOKE ALL ON FUNCTION public.promover_meta_chunks_estaveis(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promover_meta_chunks_estaveis(int, int) TO service_role;

COMMENT ON FUNCTION public.promover_meta_chunks_estaveis IS 'Sprint C: promove meta_chunks experimental→promovido se uso >= min_usos sem reprovação na janela. Chamada pelo cron consolidar-episodios.';

-- 2) decay_episodios
CREATE OR REPLACE FUNCTION public.decay_episodios(
  p_decay_per_day numeric DEFAULT 0.02,
  p_threshold_desativar numeric DEFAULT 0.05
)
RETURNS TABLE (
  episodios_decaidos int,
  episodios_desativados int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_decaidos int := 0;
  v_desativados int := 0;
BEGIN
  WITH atualizados AS (
    UPDATE public.episodic_memory em
       SET decay_factor = GREATEST(
             0.0,
             em.decay_factor - (EXTRACT(EPOCH FROM (now() - em.atualizado_em)) / 86400.0 * p_decay_per_day)
           ),
           atualizado_em = now()
     WHERE em.ativa = true
       AND em.decay_factor > 0
    RETURNING em.id, em.decay_factor
  ),
  desativados AS (
    UPDATE public.episodic_memory em
       SET ativa = false,
           atualizado_em = now()
      FROM atualizados a
     WHERE em.id = a.id
       AND a.decay_factor <= p_threshold_desativar
    RETURNING em.id
  )
  SELECT
    (SELECT count(*) FROM atualizados),
    (SELECT count(*) FROM desativados)
  INTO v_decaidos, v_desativados;

  RETURN QUERY SELECT v_decaidos, v_desativados;
END;
$$;

REVOKE ALL ON FUNCTION public.decay_episodios(numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decay_episodios(numeric, numeric) TO service_role;

COMMENT ON FUNCTION public.decay_episodios IS 'Sprint C: aplica decay aos episodic_memory (decay_factor cai com tempo, episódio desativa quando <= threshold). Chamada pelo cron decay-episodios.';

;
