CREATE OR REPLACE FUNCTION public.busca_vetorial(query_embedding extensions.vector, p_agent_id uuid, match_count integer DEFAULT 8, similarity_threshold double precision DEFAULT 0.45, p_exclude_categories text[] DEFAULT ARRAY['fluxo'::text])
 RETURNS TABLE(id uuid, title text, content text, category text, tags text[], similarity double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT kc.id, kc.title, kc.content, kc.category, kc.tags, 1 - (kc.vetor_semantico <=> query_embedding) AS similarity
  FROM public.blocos_conhecimento kc
  WHERE kc.agente_id = p_agent_id AND kc.vetor_semantico IS NOT NULL
    AND (p_exclude_categories IS NULL OR kc.category IS NULL OR kc.category <> ALL(p_exclude_categories))
    AND 1 - (kc.vetor_semantico <=> query_embedding) >= similarity_threshold
  ORDER BY kc.vetor_semantico <=> query_embedding LIMIT match_count;
END;
$function$

