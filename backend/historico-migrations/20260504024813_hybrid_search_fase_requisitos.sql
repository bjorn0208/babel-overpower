-- Onda 1 / Projeto: Fase x Requisitos Semanticos
-- Migration: hybrid_search_fase_requisitos
-- RPC de busca hibrida BM25+vector com RRF em fase_requisitos.
-- Resolucao de escopo: agente > tenant > produto > nicho > global.
-- Filtro: ativo=true e fase=p_fase.
-- SECURITY DEFINER SET search_path = public, extensions (Inviolavel 7).

CREATE OR REPLACE FUNCTION public.hybrid_search_fase_requisitos(
  p_query_text text,
  p_query_embedding halfvec(1536),
  p_fase text,
  p_agent_id uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_nicho_id uuid DEFAULT NULL,
  p_produto_id uuid DEFAULT NULL,
  p_match_count int DEFAULT 10,
  p_full_text_weight float DEFAULT 1.0,
  p_semantic_weight float DEFAULT 1.0,
  p_rrf_k int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  descricao_curta text,
  descricao_semantica text,
  obrigatorio boolean,
  evidencias jsonb,
  escopo text,
  ordem int,
  rrf_score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH base AS (
    SELECT fr.*
    FROM public.fase_requisitos fr
    WHERE fr.ativo = true
      AND fr.fase = p_fase
      AND (
        fr.escopo = 'global'
        OR (fr.escopo = 'nicho'    AND p_nicho_id   IS NOT NULL AND fr.nicho_id   = p_nicho_id)
        OR (fr.escopo = 'tenant'   AND p_tenant_id  IS NOT NULL AND fr.tenant_id  = p_tenant_id)
        OR (fr.escopo = 'produto'  AND p_produto_id IS NOT NULL AND fr.produto_id = p_produto_id)
        OR (fr.escopo = 'agente'   AND p_agent_id   IS NOT NULL AND fr.agent_id   = p_agent_id)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', coalesce(b.descricao_curta, '') || ' ' || coalesce(b.descricao_semantica, '')),
               websearch_to_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.descricao_curta, '') || ' ' || coalesce(b.descricao_semantica, ''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 30
  ),
  semantic AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY b.embedding <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.embedding IS NOT NULL
    ORDER BY b.embedding <=> p_query_embedding
    LIMIT 30
  )
  SELECT b.id,
         b.descricao_curta,
         b.descricao_semantica,
         b.obrigatorio,
         b.evidencias,
         b.escopo,
         b.ordem,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
        + coalesce(p_semantic_weight * 1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic s ON s.id = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_fase_requisitos(text, halfvec, text, uuid, uuid, uuid, uuid, int, float, float, int) IS
'Busca hibrida BM25+vector RRF em fase_requisitos. Resolucao de escopo: agente > tenant > produto > nicho > global. Filtro: ativo=true, fase=p_fase. Onda 1 do projeto fase-requisitos-semanticos.';
;
