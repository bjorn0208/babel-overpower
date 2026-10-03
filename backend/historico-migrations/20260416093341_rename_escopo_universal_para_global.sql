
-- Rename escopo 'universal' -> 'global' em behavior/human/trigger_chunks.
-- Atualiza CHECK constraints, RPCs hybrid_search e RLS policy. Transacional.

-- 1) Dropa CHECK constraints antigos
ALTER TABLE public.behavior_chunks DROP CONSTRAINT IF EXISTS behavior_chunks_escopo_check;
ALTER TABLE public.behavior_chunks DROP CONSTRAINT IF EXISTS escopo_consistente;
ALTER TABLE public.human_chunks DROP CONSTRAINT IF EXISTS human_chunks_escopo_check;
ALTER TABLE public.trigger_chunks DROP CONSTRAINT IF EXISTS trigger_chunks_escopo_check;

-- 2) UPDATE rows
UPDATE public.behavior_chunks SET escopo='global' WHERE escopo='universal';
UPDATE public.human_chunks SET escopo='global' WHERE escopo='universal';
UPDATE public.trigger_chunks SET escopo='global' WHERE escopo='universal';

-- 3) Re-adiciona CHECK com 'global'
ALTER TABLE public.behavior_chunks
  ADD CONSTRAINT behavior_chunks_escopo_check
  CHECK (escopo IN ('global','nicho','tenant','produto'));

ALTER TABLE public.behavior_chunks
  ADD CONSTRAINT escopo_consistente CHECK (
    (escopo = 'global'  AND nicho_id IS NULL     AND tenant_id IS NULL     AND produto_id IS NULL)
    OR (escopo = 'nicho' AND nicho_id IS NOT NULL AND tenant_id IS NULL     AND produto_id IS NULL)
    OR (escopo = 'tenant' AND tenant_id IS NOT NULL AND produto_id IS NULL)
    OR (escopo = 'produto' AND tenant_id IS NOT NULL AND produto_id IS NOT NULL)
  );

ALTER TABLE public.human_chunks
  ADD CONSTRAINT human_chunks_escopo_check
  CHECK (escopo IN ('global','nicho','tenant'));

ALTER TABLE public.trigger_chunks
  ADD CONSTRAINT trigger_chunks_escopo_check
  CHECK (escopo IN ('global','nicho','tenant'));

-- 4) Ajusta defaults
ALTER TABLE public.trigger_chunks ALTER COLUMN escopo SET DEFAULT 'global';
ALTER TABLE public.human_chunks ALTER COLUMN escopo SET DEFAULT 'global';

-- 5) RPC hybrid_search_behavior (schema atual, sem fase_aplicavel)
CREATE OR REPLACE FUNCTION public.hybrid_search_behavior(
  p_query_text text,
  p_query_embedding halfvec,
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_nicho_id uuid DEFAULT NULL::uuid,
  p_produto_id uuid DEFAULT NULL::uuid,
  p_match_count integer DEFAULT 20,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight double precision DEFAULT 1.0,
  p_rrf_k integer DEFAULT 50
)
RETURNS TABLE(id uuid, escopo text, situacao_descricao text, instrucao text, prioridade integer, tags text[], rrf_score double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $function$
  WITH base AS (
    SELECT bc.*
    FROM public.behavior_chunks bc
    WHERE bc.ativo = true
      AND (
        bc.escopo = 'global'
        OR (bc.escopo = 'nicho' AND p_nicho_id IS NOT NULL AND bc.nicho_id = p_nicho_id)
        OR (bc.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND bc.tenant_id = p_tenant_id)
        OR (bc.escopo = 'produto' AND p_tenant_id IS NOT NULL AND p_produto_id IS NOT NULL
            AND bc.tenant_id = p_tenant_id AND bc.produto_id = p_produto_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.behavior_chunks_tenant_overrides o
        WHERE o.chunk_id = bc.id
          AND p_tenant_id IS NOT NULL
          AND o.tenant_id = p_tenant_id
          AND o.ativo = false
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
        + coalesce(p_semantic_weight * 1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic s ON s.id = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST
  LIMIT p_match_count;
$function$;

-- 6) RPC hybrid_search_human
CREATE OR REPLACE FUNCTION public.hybrid_search_human(
  p_query_text text,
  p_query_embedding halfvec,
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_nicho_id uuid DEFAULT NULL::uuid,
  p_persona_tags text[] DEFAULT NULL::text[],
  p_match_count integer DEFAULT 10,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight double precision DEFAULT 1.0,
  p_rrf_k integer DEFAULT 50
)
RETURNS TABLE(id uuid, categoria text, subcategoria text, regra text, exemplos_bons text[], exemplos_ruins text[], contexto_uso text, quando_nao_usar text, tags_persona text[], escopo text, prioridade integer, rrf_score double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $function$
  WITH base AS (
    SELECT hc.* FROM public.human_chunks hc WHERE hc.ativo = true
      AND (hc.escopo='global'
        OR (hc.escopo='nicho' AND p_nicho_id IS NOT NULL AND hc.nicho_id=p_nicho_id)
        OR (hc.escopo='tenant' AND p_tenant_id IS NOT NULL AND hc.tenant_id=p_tenant_id))
      AND (p_persona_tags IS NULL OR array_length(p_persona_tags,1) IS NULL OR hc.tags_persona && p_persona_tags)
  ),
  full_text AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(
      to_tsvector('portuguese', coalesce(b.regra,'')||' '||coalesce(b.contexto_uso,'')),
      websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.regra,'')||' '||coalesce(b.contexto_uso,''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 40
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.embedding <=> p_query_embedding) AS rnk
    FROM base b WHERE b.embedding IS NOT NULL
    ORDER BY b.embedding <=> p_query_embedding LIMIT 40
  )
  SELECT b.id, b.categoria, b.subcategoria, b.regra, b.exemplos_bons, b.exemplos_ruins,
    b.contexto_uso, b.quando_nao_usar, b.tags_persona, b.escopo, b.prioridade,
    (coalesce(p_full_text_weight*1.0/(p_rrf_k+ft.rnk),0.0)+coalesce(p_semantic_weight*1.0/(p_rrf_k+s.rnk),0.0)) AS rrf_score
  FROM base b LEFT JOIN full_text ft ON ft.id=b.id LEFT JOIN semantic s ON s.id=b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST LIMIT p_match_count;
$function$;

-- 7) RPC hybrid_search_trigger
CREATE OR REPLACE FUNCTION public.hybrid_search_trigger(
  p_query_text text,
  p_query_embedding halfvec,
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_nicho_id uuid DEFAULT NULL::uuid,
  p_match_count integer DEFAULT 5,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight double precision DEFAULT 1.0,
  p_rrf_k integer DEFAULT 50
)
RETURNS TABLE(id uuid, nome_trigger text, exemplo_frase text, acao_disparada text, acao_payload jsonb, escopo text, rrf_score double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $function$
  WITH base AS (
    SELECT tc.* FROM public.trigger_chunks tc WHERE tc.ativo = true
      AND (tc.escopo='global'
        OR (tc.escopo='nicho' AND p_nicho_id IS NOT NULL AND tc.nicho_id=p_nicho_id)
        OR (tc.escopo='tenant' AND p_tenant_id IS NOT NULL AND tc.tenant_id=p_tenant_id))
  ),
  full_text AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(
      to_tsvector('portuguese', coalesce(b.nome_trigger,'')||' '||coalesce(b.exemplo_frase,'')),
      websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.nome_trigger,'')||' '||coalesce(b.exemplo_frase,''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 30
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.embedding <=> p_query_embedding) AS rnk
    FROM base b WHERE b.embedding IS NOT NULL
    ORDER BY b.embedding <=> p_query_embedding LIMIT 30
  )
  SELECT b.id, b.nome_trigger, b.exemplo_frase, b.acao_disparada, b.acao_payload, b.escopo,
    (coalesce(p_full_text_weight*1.0/(p_rrf_k+ft.rnk),0.0)+coalesce(p_semantic_weight*1.0/(p_rrf_k+s.rnk),0.0)) AS rrf_score
  FROM base b LEFT JOIN full_text ft ON ft.id=b.id LEFT JOIN semantic s ON s.id=b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC LIMIT p_match_count;
$function$;

-- 8) RLS policy behavior_chunks
DROP POLICY IF EXISTS "tenant_read_chunks" ON public.behavior_chunks;
CREATE POLICY "tenant_read_chunks" ON public.behavior_chunks
  FOR SELECT TO authenticated USING (
    ativo = true AND (
      escopo = 'global'
      OR (escopo = 'nicho' AND nicho_id = (SELECT nicho_id FROM public.profiles WHERE id = (SELECT auth.uid())))
      OR (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
      OR (escopo = 'produto' AND tenant_id = (SELECT auth.uid()))
    )
  );

;
