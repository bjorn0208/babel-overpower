-- Sprint 4/5 · KB acadêmica isolada (procedência validada — papers, datasets,
-- pesquisas). Diferente de admin_ia_chunks (operacional do agente).

CREATE TABLE IF NOT EXISTS public.admin_ia_kb_academica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  conteudo text NOT NULL,
  fonte_path text NOT NULL,
  fonte_secao text,
  topico text,
  tags text[] DEFAULT '{}',
  embedding extensions.halfvec(1536),
  embedding_status text DEFAULT 'pending' CHECK (embedding_status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text])),
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_academica_topico ON public.admin_ia_kb_academica(topico) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_kb_academica_embedding ON public.admin_ia_kb_academica
  USING hnsw ((embedding) extensions.halfvec_cosine_ops) WHERE embedding IS NOT NULL AND ativo = true;

ALTER TABLE public.admin_ia_kb_academica ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_kb_acad_all" ON public.admin_ia_kb_academica FOR ALL TO authenticated
  USING ((SELECT system_role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'platform_admin')
  WITH CHECK ((SELECT system_role FROM public.profiles WHERE id = (SELECT auth.uid())) = 'platform_admin');

-- RPC de busca taxonômica (BM25 + vetor + RRF)
CREATE OR REPLACE FUNCTION public.search_admin_ia_kb_academica(
  p_query_text text,
  p_query_embedding extensions.halfvec,
  p_top_k integer DEFAULT 5,
  p_rrf_k integer DEFAULT 60
)
RETURNS TABLE (id uuid, titulo text, fonte_path text, conteudo text, topico text, rrf_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH bm25 AS (
    SELECT c.id, ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(to_tsvector('portuguese', coalesce(c.titulo,'') || ' ' || c.conteudo), plainto_tsquery('portuguese', p_query_text)) DESC
    ) AS rk
    FROM public.admin_ia_kb_academica c
    WHERE c.ativo = true
      AND to_tsvector('portuguese', coalesce(c.titulo,'') || ' ' || c.conteudo) @@ plainto_tsquery('portuguese', p_query_text)
    LIMIT 30
  ),
  cosine AS (
    SELECT c.id, ROW_NUMBER() OVER (
      ORDER BY c.embedding OPERATOR(extensions.<=>) p_query_embedding ASC
    ) AS rk
    FROM public.admin_ia_kb_academica c
    WHERE c.ativo = true AND c.embedding IS NOT NULL
    LIMIT 30
  ),
  fundido AS (
    SELECT coalesce(b.id, v.id) AS id,
      (1.0/(p_rrf_k + coalesce(b.rk, 1000))) + (1.0/(p_rrf_k + coalesce(v.rk, 1000))) AS rrf
    FROM bm25 b FULL OUTER JOIN cosine v ON v.id = b.id
  )
  SELECT c.id, c.titulo, c.fonte_path, c.conteudo, c.topico, f.rrf::numeric
  FROM fundido f JOIN public.admin_ia_kb_academica c ON c.id = f.id
  ORDER BY f.rrf DESC LIMIT p_top_k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_admin_ia_kb_academica(text, extensions.halfvec, integer, integer) TO service_role, authenticated;
;
