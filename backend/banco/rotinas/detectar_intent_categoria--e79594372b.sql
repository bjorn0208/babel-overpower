CREATE OR REPLACE FUNCTION public.detectar_intent_categoria(p_query_embedding extensions.halfvec, p_top_k integer DEFAULT 2)
 RETURNS TABLE(intent text, frase_pivo text, categorias_alvo text[], similaridade numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.intent,
    p.frase_pivo,
    p.categorias_alvo,
    (1 - (p.vetor_semantico <=> p_query_embedding))::numeric AS similaridade
  FROM public.pivots_categoria_intent p
  WHERE p.ativo = true
    AND p.vetor_semantico IS NOT NULL
    AND p.embedding_status = 'ready'
  ORDER BY p.vetor_semantico <=> p_query_embedding
  LIMIT p_top_k;
END;
$function$

