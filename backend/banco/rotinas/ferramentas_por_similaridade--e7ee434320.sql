CREATE OR REPLACE FUNCTION public.ferramentas_por_similaridade(p_query_embedding extensions.halfvec, p_top_k integer DEFAULT 8, p_escopo text DEFAULT NULL::text, p_nomes text[] DEFAULT NULL::text[])
 RETURNS TABLE(nome_tool text, descricao text, distancia double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT f.nome_tool,
         f.descricao,
         (f.vetor_semantico OPERATOR(extensions.<=>) p_query_embedding)::double precision AS distancia
  FROM public.ferramentas_dinamicas f
  WHERE f.ativo
    AND f.vetor_semantico IS NOT NULL
    AND (p_escopo IS NULL OR f.escopo::text = p_escopo)
    AND (p_nomes IS NULL OR f.nome_tool = ANY(p_nomes))
  ORDER BY f.vetor_semantico OPERATOR(extensions.<=>) p_query_embedding
  LIMIT GREATEST(p_top_k, 1);
$function$

