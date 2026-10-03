-- A5.1 Trilha A "memória viva": substrato de reforço/emoção + reconsolidar_fatos + RPC v2 (gate de validade).
-- Aditivo e idempotente. A RPC v1 (busca_hibrida_memoria_lead) permanece intocada e ativa.

ALTER TABLE public.memoria_lead
  ADD COLUMN IF NOT EXISTS vezes_evocado integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_evocacao_em timestamptz,
  ADD COLUMN IF NOT EXISTS valencia_emocional numeric NOT NULL DEFAULT 0.0;

COMMENT ON COLUMN public.memoria_lead.vezes_evocado IS 'A5 memória viva: reforço hebbiano — nº de vezes que o fato foi recuperado no recall.';
COMMENT ON COLUMN public.memoria_lead.ultima_evocacao_em IS 'A5 memória viva: relógio do esquecimento (Ebbinghaus) — última evocação.';
COMMENT ON COLUMN public.memoria_lead.valencia_emocional IS 'A5 memória viva: carga emocional 0..1 (preenchida pela destilação A6); modula saliência.';

-- reconsolidar_fatos: evocar um fato o fortalece (espelho de reconsolidar_episodios).
CREATE OR REPLACE FUNCTION public.reconsolidar_fatos(p_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH upd AS (
    UPDATE public.memoria_lead
       SET vezes_evocado      = COALESCE(vezes_evocado, 0) + 1,
           ultima_evocacao_em = now(),
           atualizado_em      = now()
     WHERE id = ANY(p_ids)
       AND ativa = true
    RETURNING id
  )
  SELECT count(*)::int FROM upd;
$$;

-- RPC v2: RRF (BM25 + vetor) × confianca^0.6 + GATE de validade bitemporal.
-- Retorna os campos de saliência crus — o motor (A5.2) aplica reforço/decay/emoção + MMR + piso.
CREATE OR REPLACE FUNCTION public.busca_hibrida_memoria_lead_v2(
  p_lead_id uuid,
  p_query_text text,
  p_query_embedding halfvec,
  p_match_count integer DEFAULT 30,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight double precision DEFAULT 1.0,
  p_rrf_k integer DEFAULT 50,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  fato text,
  categoria text,
  relevancia text,
  confianca numeric,
  criado_em timestamptz,
  ultima_evocacao_em timestamptz,
  vezes_evocado integer,
  valencia_emocional numeric,
  score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT lm.*
    FROM public.memoria_lead lm
    WHERE lm.lead_id          = p_lead_id
      AND lm.tenant_id        = COALESCE(p_tenant_id, (select auth.uid()))
      AND lm.ativa            = true
      AND lm.embedding_status = 'pronto'
      AND lm.fonte            != 'teste'
      -- GATE bitemporal: fato vencido nunca volta
      AND (lm.real_world_valid_to IS NULL OR lm.real_world_valid_to > now())
      AND (lm.system_expired_at  IS NULL OR lm.system_expired_at  > now())
  ),
  keyword AS (
    SELECT b.id,
           row_number() OVER (
             ORDER BY ts_rank(to_tsvector('portuguese', b.fato), plainto_tsquery('portuguese', p_query_text)) DESC
           ) AS rank_k
    FROM base b
    WHERE to_tsvector('portuguese', b.fato) @@ plainto_tsquery('portuguese', p_query_text)
    LIMIT p_match_count * 2
  ),
  semantic AS (
    SELECT b.id,
           row_number() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding ASC) AS rank_s
    FROM base b
    ORDER BY b.vetor_semantico <=> p_query_embedding ASC
    LIMIT p_match_count * 2
  )
  SELECT
    b.id,
    b.fato,
    b.categoria,
    b.relevancia,
    b.confianca,
    b.criado_em,
    b.ultima_evocacao_em,
    b.vezes_evocado,
    b.valencia_emocional,
    (
      ( COALESCE(p_full_text_weight * (1.0 / (p_rrf_k + k.rank_k)), 0.0)
      + COALESCE(p_semantic_weight * (1.0 / (p_rrf_k + s.rank_s)), 0.0) )
      * power(COALESCE(b.confianca, 0.5), 0.6)
    ) AS score
  FROM base b
  LEFT JOIN keyword  k ON k.id = b.id
  LEFT JOIN semantic s ON s.id = b.id
  WHERE (k.id IS NOT NULL OR s.id IS NOT NULL)
  ORDER BY score DESC
  LIMIT p_match_count;
$function$;
;
