
CREATE OR REPLACE FUNCTION vector_search(
  query_embedding vector(1536),
  p_agent_id uuid,
  match_count int DEFAULT 8,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  category text,
  tags text[],
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.title,
    kc.content,
    kc.category,
    kc.tags,
    (1 - (kc.embedding <=> query_embedding))::float AS similarity
  FROM knowledge_chunks kc
  WHERE kc.agent_id = p_agent_id
    AND kc.embedding IS NOT NULL
    AND (1 - (kc.embedding <=> query_embedding))::float >= similarity_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

;
