-- Fase 2B: Adicionar filtro de tom (formal/informal) às RPCs de busca híbrida.
-- Decisão arquitetural: tom é TAG em .tags[] — valores reservados: 'formal', 'informal'.
-- Semântica:
--   p_tom IS NULL         → retorna tudo (modo espelhado ou agente sem tom fixo)
--   p_tom = 'formal'      → retorna chunks sem tag de tom + chunks com tag 'formal'
--   p_tom = 'informal'    → retorna chunks sem tag de tom + chunks com tag 'informal'
-- Estratégia: DROP das assinaturas antigas (com tipos explícitos) + CREATE das novas.
-- O parâmetro p_tom é adicionado ao final com DEFAULT NULL (backward-compat no código
-- chamador — Supabase JS client usa parâmetros nomeados, ignora defaults automaticamente).
-- search_path preservado: public, extensions (igual às versões anteriores).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. hybrid_search_behavior
--    Assinatura antiga: (text, halfvec, uuid, uuid, uuid, int, float8, float8, int)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hybrid_search_behavior(
  text, halfvec, uuid, uuid, uuid, integer, double precision, double precision, integer
);

CREATE OR REPLACE FUNCTION public.hybrid_search_behavior(
  p_query_text       text,
  p_query_embedding  halfvec,
  p_tenant_id        uuid    DEFAULT NULL,
  p_nicho_id         uuid    DEFAULT NULL,
  p_produto_id       uuid    DEFAULT NULL,
  p_match_count      integer DEFAULT 20,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight  double precision DEFAULT 1.0,
  p_rrf_k            integer DEFAULT 50,
  p_tom              text    DEFAULT NULL
)
RETURNS TABLE (
  id                  uuid,
  escopo              text,
  situacao_descricao  text,
  instrucao           text,
  prioridade          integer,
  tags                text[],
  rrf_score           double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  WITH base AS (
    SELECT bc.*
    FROM public.behavior_chunks bc
    WHERE bc.ativo = true
      AND (
        bc.escopo = 'global'
        OR (bc.escopo = 'nicho'   AND p_nicho_id   IS NOT NULL AND bc.nicho_id   = p_nicho_id)
        OR (bc.escopo = 'tenant'  AND p_tenant_id  IS NOT NULL AND bc.tenant_id  = p_tenant_id)
        OR (bc.escopo = 'produto' AND p_tenant_id  IS NOT NULL AND p_produto_id IS NOT NULL
            AND bc.tenant_id = p_tenant_id AND bc.produto_id = p_produto_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.behavior_chunks_tenant_overrides o
        WHERE o.chunk_id  = bc.id
          AND p_tenant_id IS NOT NULL
          AND o.tenant_id = p_tenant_id
          AND o.ativo = false
      )
      -- filtro de tom: NULL devolve tudo; chunk sem tag de tom devolve em qualquer modo
      AND (
        p_tom IS NULL
        OR bc.tags IS NULL
        OR NOT (bc.tags && ARRAY['formal','informal']::text[])
        OR p_tom = ANY(bc.tags)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', coalesce(b.situacao_descricao,'') || ' ' || coalesce(b.instrucao,'')),
               websearch_to_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.situacao_descricao,'') || ' ' || coalesce(b.instrucao,''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.embedding <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.embedding IS NOT NULL
    ORDER BY b.embedding <=> p_query_embedding
    LIMIT 60
  )
  SELECT b.id, b.escopo, b.situacao_descricao, b.instrucao, b.prioridade, b.tags,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
        + coalesce(p_semantic_weight  * 1.0 / (p_rrf_k + s.rnk),  0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic  s  ON s.id  = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_behavior(text, halfvec, uuid, uuid, uuid, integer, double precision, double precision, integer, text) IS
  'Busca híbrida (BM25 + vector + RRF) em behavior_chunks. Sem filtro de fase — RAG 100% semântico (V2). p_tom filtra por tag de tom (formal/informal); NULL devolve tudo.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. hybrid_search_knowledge v1 (legada — p_agent_id NOT NULL, 8 colunas de retorno)
--    Assinatura antiga: (text, halfvec, uuid, text, text, int, float8, float8, int)
--    Em uso em: retrieve-router.ts e tests/replay-seco/run.ts
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hybrid_search_knowledge(
  text, halfvec, uuid, text, text, integer, double precision, double precision, integer
);

CREATE OR REPLACE FUNCTION public.hybrid_search_knowledge(
  p_query_text       text,
  p_query_embedding  halfvec,
  p_agent_id         uuid,
  p_tipo             text    DEFAULT NULL,
  p_category         text    DEFAULT NULL,
  p_match_count      integer DEFAULT 20,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight  double precision DEFAULT 1.0,
  p_rrf_k            integer DEFAULT 50,
  p_tom              text    DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  agent_id    uuid,
  title       text,
  content     text,
  category    text,
  tipo        text,
  tags        text[],
  rrf_score   double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  WITH base AS (
    SELECT kc.*
    FROM public.knowledge_chunks kc
    WHERE kc.ativo = true
      AND kc.agent_id = p_agent_id
      AND (p_tipo     IS NULL OR kc.tipo     = p_tipo)
      AND (p_category IS NULL OR kc.category = p_category)
      -- filtro de tom: NULL devolve tudo; chunk sem tag de tom devolve em qualquer modo
      AND (
        p_tom IS NULL
        OR kc.tags IS NULL
        OR NOT (kc.tags && ARRAY['formal','informal']::text[])
        OR p_tom = ANY(kc.tags)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(b.fts, websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND b.fts @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY b.embedding <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.embedding IS NOT NULL
    ORDER BY b.embedding <=> p_query_embedding
    LIMIT 60
  )
  SELECT b.id, b.agent_id, b.title, b.content, b.category, b.tipo, b.tags,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
        + coalesce(p_semantic_weight  * 1.0 / (p_rrf_k + s.rnk),  0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic  s  ON s.id  = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_knowledge(text, halfvec, uuid, text, text, integer, double precision, double precision, integer, text) IS
  'Busca híbrida em knowledge_chunks (v1 legada — filtra por agent_id fixo). p_tom filtra por tag de tom (formal/informal); NULL devolve tudo. Candidata a deprecação futura — confirmar com Theus antes de dropar.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. hybrid_search_knowledge v2 (ativa — cascata de escopo, 9 colunas de retorno)
--    Assinatura antiga: (text, halfvec, uuid, uuid, text, text, int, float8, float8, int)
--    Em uso em: search-knowledge.ts
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hybrid_search_knowledge(
  text, halfvec, uuid, uuid, text, text, integer, double precision, double precision, integer
);

CREATE OR REPLACE FUNCTION public.hybrid_search_knowledge(
  p_query_text       text,
  p_query_embedding  halfvec,
  p_agent_id         uuid    DEFAULT NULL,
  p_nicho_id         uuid    DEFAULT NULL,
  p_tipo             text    DEFAULT NULL,
  p_category         text    DEFAULT NULL,
  p_match_count      integer DEFAULT 20,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight  double precision DEFAULT 1.0,
  p_rrf_k            integer DEFAULT 50,
  p_tom              text    DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  agent_id    uuid,
  escopo      text,
  title       text,
  content     text,
  category    text,
  tipo        text,
  tags        text[],
  rrf_score   double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  WITH base AS (
    SELECT kc.*
    FROM public.knowledge_chunks kc
    WHERE kc.ativo = true
      AND (
        kc.escopo = 'global'
        OR (kc.escopo = 'nicho'  AND p_nicho_id IS NOT NULL AND kc.nicho_id  = p_nicho_id)
        OR (kc.escopo = 'tenant' AND p_agent_id IS NOT NULL AND kc.agent_id  = p_agent_id)
      )
      AND (p_tipo     IS NULL OR kc.tipo     = p_tipo)
      AND (p_category IS NULL OR kc.category = p_category)
      -- filtro de tom: NULL devolve tudo; chunk sem tag de tom devolve em qualquer modo
      AND (
        p_tom IS NULL
        OR kc.tags IS NULL
        OR NOT (kc.tags && ARRAY['formal','informal']::text[])
        OR p_tom = ANY(kc.tags)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(b.fts, websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND b.fts @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY b.embedding <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.embedding IS NOT NULL
    ORDER BY b.embedding <=> p_query_embedding
    LIMIT 60
  )
  SELECT b.id, b.agent_id, kc.escopo, b.title, b.content, b.category, b.tipo, b.tags,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
        + coalesce(p_semantic_weight  * 1.0 / (p_rrf_k + s.rnk),  0.0)) AS rrf_score
  FROM base b
  JOIN public.knowledge_chunks kc ON kc.id = b.id
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic  s  ON s.id  = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_knowledge(text, halfvec, uuid, uuid, text, text, integer, double precision, double precision, integer, text) IS
  'Busca híbrida em knowledge_chunks com cascata de escopo (global|nicho|tenant). Motor v2. p_tom filtra por tag de tom (formal/informal); NULL devolve tudo.';

;
