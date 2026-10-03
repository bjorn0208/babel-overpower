-- Palco Vivo / app Conversas — Tijolo 1.
-- RPC que acha LEADS por significado nos fatos destilados (memoria_lead),
-- no tenant inteiro, devolvendo o melhor fato que casou por lead + dados do lead.
-- Espelha o padrão RRF (keyword + semantic) de busca_hibrida_memoria_lead,
-- mas SEM p_lead_id (varre o tenant) e agrupa por lead.

-- Índices de apoio (busca tenant-wide precisa deles; tabela 7k linhas, build rápido).
CREATE INDEX IF NOT EXISTS memoria_lead_vetor_hnsw
  ON public.memoria_lead USING hnsw (vetor_semantico halfvec_cosine_ops);

CREATE INDEX IF NOT EXISTS memoria_lead_fato_fts
  ON public.memoria_lead USING gin (to_tsvector('portuguese', fato));

CREATE OR REPLACE FUNCTION public.buscar_leads_por_significado(
  p_tenant_id uuid,
  p_query_text text,
  p_query_embedding halfvec,
  p_match_count integer DEFAULT 12,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight double precision DEFAULT 1.5,
  p_rrf_k integer DEFAULT 50
)
RETURNS TABLE(
  lead_id uuid,
  name text,
  phone text,
  temperatura_lead text,
  fase_pipeline text,
  updated_at timestamptz,
  fato_match text,
  categoria text,
  score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  WITH keyword AS (
    SELECT lm.id,
           row_number() OVER (
             ORDER BY ts_rank(to_tsvector('portuguese', lm.fato), plainto_tsquery('portuguese', p_query_text)) DESC
           ) AS rank_k
    FROM public.memoria_lead lm
    WHERE lm.tenant_id        = p_tenant_id
      AND lm.ativa            = true
      AND lm.embedding_status = 'pronto'
      AND lm.fonte            != 'teste'
      AND to_tsvector('portuguese', lm.fato) @@ plainto_tsquery('portuguese', p_query_text)
    LIMIT p_match_count * 8
  ),
  semantic AS (
    SELECT lm.id,
           row_number() OVER (ORDER BY lm.vetor_semantico <=> p_query_embedding ASC) AS rank_s
    FROM public.memoria_lead lm
    WHERE lm.tenant_id        = p_tenant_id
      AND lm.ativa            = true
      AND lm.embedding_status = 'pronto'
      AND lm.fonte            != 'teste'
    ORDER BY lm.vetor_semantico <=> p_query_embedding ASC
    LIMIT p_match_count * 8
  ),
  fatos_rankeados AS (
    SELECT
      lm.lead_id,
      lm.fato,
      lm.categoria,
      COALESCE(p_full_text_weight * (1.0 / (p_rrf_k + k.rank_k)), 0.0)
      + COALESCE(p_semantic_weight * (1.0 / (p_rrf_k + s.rank_s)), 0.0) AS score
    FROM public.memoria_lead lm
    LEFT JOIN keyword  k ON k.id = lm.id
    LEFT JOIN semantic s ON s.id = lm.id
    WHERE lm.tenant_id = p_tenant_id
      AND lm.ativa     = true
      AND lm.fonte     != 'teste'
      AND (k.id IS NOT NULL OR s.id IS NOT NULL)
  ),
  melhor_por_lead AS (
    SELECT DISTINCT ON (fr.lead_id)
      fr.lead_id,
      fr.fato AS fato_match,
      fr.categoria,
      fr.score
    FROM fatos_rankeados fr
    ORDER BY fr.lead_id, fr.score DESC
  )
  SELECT
    l.id AS lead_id,
    l.name,
    l.phone,
    l.temperatura_lead,
    l.fase_pipeline,
    l.updated_at,
    mpl.fato_match,
    mpl.categoria,
    mpl.score
  FROM melhor_por_lead mpl
  JOIN public.leads l ON l.id = mpl.lead_id
  WHERE l.tenant_id    = p_tenant_id
    AND l.deleted_at IS NULL
  ORDER BY mpl.score DESC
  LIMIT p_match_count;
$function$;
;
