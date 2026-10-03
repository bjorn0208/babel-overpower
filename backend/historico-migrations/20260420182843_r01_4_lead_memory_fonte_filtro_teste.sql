
-- Migration: r01_4_lead_memory_fonte_filtro_teste
-- Expande CHECK constraint de fonte para incluir 'teste' e 'producao'.
-- Restrói RPCs lead_memory_similar e hybrid_search_lead_memory
-- com filtro AND lm.fonte != 'teste' em todos os CTEs e WHERE finals.
-- Chunks de teste devem usar fonte='teste' explícito.
-- extract-lead-facts grava fonte='auto' (padrão) ou fonte='producao'.
-- DOWN:
--   ALTER TABLE public.lead_memory DROP CONSTRAINT IF EXISTS lead_memory_fonte_check;
--   ALTER TABLE public.lead_memory ADD CONSTRAINT lead_memory_fonte_check CHECK (fonte IN ('auto','manual'));
--   (recriar RPCs sem filtro fonte)

-- 1. Normalizar rows com valores fora do novo conjunto (segurança de idempotência)
UPDATE public.lead_memory
  SET fonte = 'auto'
  WHERE fonte NOT IN ('auto', 'manual', 'teste', 'producao')
     OR fonte IS NULL;

-- 2. Dropar constraint antiga e recriar expandida
ALTER TABLE public.lead_memory
  DROP CONSTRAINT IF EXISTS lead_memory_fonte_check;

ALTER TABLE public.lead_memory
  ADD CONSTRAINT lead_memory_fonte_check
  CHECK (fonte IN ('auto', 'manual', 'teste', 'producao'));

COMMENT ON COLUMN public.lead_memory.fonte IS
  'Origem do fato. auto = extract-lead-facts (produção); manual = operador humano; producao = explicitamente marcado como produção; teste = fixture de teste — NUNCA aparece em buscas semânticas/híbridas.';

-- 3. Recriar lead_memory_similar com filtro fonte != 'teste'
CREATE OR REPLACE FUNCTION public.lead_memory_similar(
  p_lead_id    uuid,
  p_embedding  halfvec,
  p_threshold  double precision DEFAULT 0.85,
  p_top_k      integer          DEFAULT 5
)
RETURNS TABLE(id uuid, fato text, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  -- Gate anti-duplicado Mem0-style:
  -- Retorna fatos semanticamente similares para o lead especificado.
  -- Se retornar rows: fato já existe semanticamente → NOOP/UPDATE.
  -- Se retornar vazio: fato novo → ADD.
  -- Filtro duplo lead_id + tenant_id garante isolamento por lead E por tenant (anti-LGPD-break).
  -- fonte != 'teste': fixtures de teste não contaminam busca de produção (anti-envenenamento Wave 0).
  SELECT
    lm.id,
    lm.fato,
    1.0 - (lm.embedding <=> p_embedding) AS similarity
  FROM public.lead_memory lm
  WHERE lm.lead_id           = p_lead_id
    AND lm.tenant_id         = (select auth.uid())
    AND lm.ativa             = true
    AND lm.embedding_status  = 'ready'
    AND lm.fonte             != 'teste'
    AND (1.0 - (lm.embedding <=> p_embedding)) >= p_threshold
  ORDER BY lm.embedding <=> p_embedding ASC
  LIMIT p_top_k;
$$;

GRANT EXECUTE ON FUNCTION public.lead_memory_similar(uuid, halfvec, double precision, integer)
  TO authenticated, service_role;

-- 4. Recriar hybrid_search_lead_memory com filtro fonte != 'teste' em todos os CTEs + WHERE final
CREATE OR REPLACE FUNCTION public.hybrid_search_lead_memory(
  p_lead_id          uuid,
  p_query_text       text,
  p_query_embedding  halfvec,
  p_match_count      integer          DEFAULT 5,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight  double precision DEFAULT 1.0,
  p_rrf_k            integer          DEFAULT 50
)
RETURNS TABLE(id uuid, fato text, categoria text, relevancia text, score double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  -- Busca híbrida BM25 + cosine com RRF, filtrada por lead_id (anti-LGPD-break).
  -- Filtro duplo: lead_id = p_lead_id AND tenant_id = auth.uid().
  -- fonte != 'teste' em TODOS os braços: fixtures de teste não contaminam produção (anti-envenenamento Wave 0).
  -- keyword: full-text BM25 sobre campo fato em português.
  -- semantic: similaridade cosine via operador <=>.
  -- RRF funde os rankings: score = w_bm25/(k+rank_bm25) + w_sem/(k+rank_sem).
  WITH keyword AS (
    SELECT lm.id,
           row_number() OVER (
             ORDER BY ts_rank(
               to_tsvector('portuguese', lm.fato),
               plainto_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rank_k
    FROM public.lead_memory lm
    WHERE lm.lead_id          = p_lead_id
      AND lm.tenant_id        = (select auth.uid())
      AND lm.ativa            = true
      AND lm.embedding_status = 'ready'
      AND lm.fonte            != 'teste'
      AND to_tsvector('portuguese', lm.fato)
          @@ plainto_tsquery('portuguese', p_query_text)
    LIMIT p_match_count * 2
  ),
  semantic AS (
    SELECT lm.id,
           row_number() OVER (ORDER BY lm.embedding <=> p_query_embedding ASC) AS rank_s
    FROM public.lead_memory lm
    WHERE lm.lead_id          = p_lead_id
      AND lm.tenant_id        = (select auth.uid())
      AND lm.ativa            = true
      AND lm.embedding_status = 'ready'
      AND lm.fonte            != 'teste'
    ORDER BY lm.embedding <=> p_query_embedding ASC
    LIMIT p_match_count * 2
  )
  SELECT
    lm.id,
    lm.fato,
    lm.categoria,
    lm.relevancia,
    COALESCE(p_full_text_weight * (1.0 / (p_rrf_k + k.rank_k)), 0.0)
    + COALESCE(p_semantic_weight * (1.0 / (p_rrf_k + s.rank_s)), 0.0) AS score
  FROM public.lead_memory lm
  LEFT JOIN keyword  k ON k.id = lm.id
  LEFT JOIN semantic s ON s.id = lm.id
  WHERE lm.lead_id          = p_lead_id
    AND lm.tenant_id        = (select auth.uid())
    AND lm.ativa            = true
    AND lm.fonte            != 'teste'
    AND (k.id IS NOT NULL OR s.id IS NOT NULL)
  ORDER BY score DESC
  LIMIT p_match_count;
$$;

GRANT EXECUTE ON FUNCTION public.hybrid_search_lead_memory(uuid, text, halfvec, integer, double precision, double precision, integer)
  TO authenticated, service_role;

;
