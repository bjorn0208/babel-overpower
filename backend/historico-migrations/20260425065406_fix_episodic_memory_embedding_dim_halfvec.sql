
-- FIX BUG #7: alinha episodic_memory ao padrão das outras 7 RAGs (halfvec(1536))

DROP INDEX IF EXISTS public.idx_episodic_memory_embedding_hnsw;

ALTER TABLE public.episodic_memory
  ALTER COLUMN embedding TYPE extensions.halfvec(1536) USING NULL;

CREATE INDEX IF NOT EXISTS idx_episodic_memory_embedding_hnsw
  ON public.episodic_memory USING hnsw (embedding extensions.halfvec_cosine_ops);

-- DROP overload antigo da RPC (vector 1024)
DROP FUNCTION IF EXISTS public.hybrid_search_episodic(text, extensions.vector, uuid, uuid, int);

-- Recria RPC com halfvec(1536)
CREATE OR REPLACE FUNCTION public.hybrid_search_episodic(
  p_query_text text,
  p_query_embedding extensions.halfvec(1536),
  p_tenant_id uuid,
  p_lead_id uuid DEFAULT NULL,
  p_match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  lead_id uuid,
  episodio_resumo text,
  gancho text,
  emocao text,
  relevancia_efetiva numeric,
  similarity numeric,
  criado_em timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    em.id,
    em.conversation_id,
    em.lead_id,
    em.episodio_resumo,
    em.gancho,
    em.emocao,
    (em.relevancia * em.decay_factor)::numeric AS relevancia_efetiva,
    (1 - (em.embedding <=> p_query_embedding))::numeric AS similarity,
    em.criado_em
  FROM public.episodic_memory em
  WHERE em.tenant_id = p_tenant_id
    AND em.ativa = true
    AND em.embedding IS NOT NULL
    AND (p_lead_id IS NULL OR em.lead_id = p_lead_id)
  ORDER BY (em.embedding <=> p_query_embedding) ASC, (em.relevancia * em.decay_factor) DESC
  LIMIT p_match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.hybrid_search_episodic(text, extensions.halfvec, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hybrid_search_episodic(text, extensions.halfvec, uuid, uuid, int) TO authenticated, service_role;

-- Re-enfileira o(s) episódio(s) pendente(s) direto na fila pgmq
INSERT INTO pgmq.q_embedding_jobs (read_ct, enqueued_at, vt, message)
SELECT
  0,
  now(),
  now(),
  jsonb_build_object('table', 'episodic_memory', 'row_id', em.id, 'text', em.episodio_resumo)
FROM public.episodic_memory em
WHERE em.embedding_status = 'pending';

;
