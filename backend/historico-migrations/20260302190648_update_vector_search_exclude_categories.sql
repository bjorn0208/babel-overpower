
CREATE OR REPLACE FUNCTION public.vector_search(
  query_embedding vector,
  p_agent_id uuid,
  match_count integer DEFAULT 8,
  similarity_threshold double precision DEFAULT 0.45,
  p_exclude_categories text[] DEFAULT ARRAY['fluxo']::text[]
)
RETURNS TABLE(id uuid, title text, content text, category text, tags text[], similarity double precision)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT kc.id, kc.title, kc.content, kc.category, kc.tags,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.agent_id = p_agent_id
    AND kc.embedding IS NOT NULL
    AND (p_exclude_categories IS NULL OR kc.category IS NULL OR kc.category <> ALL(p_exclude_categories))
    AND 1 - (kc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

;
