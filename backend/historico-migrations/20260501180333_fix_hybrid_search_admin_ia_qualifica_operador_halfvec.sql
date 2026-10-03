CREATE OR REPLACE FUNCTION public.hybrid_search_admin_ia(
  p_query_text text,
  p_query_embedding extensions.halfvec,
  p_categoria_filter text DEFAULT NULL::text,
  p_top_k integer DEFAULT 8,
  p_rrf_k integer DEFAULT 60
)
RETURNS TABLE(id uuid, titulo text, fonte_path text, conteudo text, categoria text, rrf_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH
  bm25 AS (
    SELECT c.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', coalesce(c.titulo,'') || ' ' || c.conteudo),
               plainto_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rk
      FROM public.admin_ia_chunks c
     WHERE c.ativo = true
       AND (p_categoria_filter IS NULL OR c.categoria = p_categoria_filter OR c.categoria IN ('arquitetura','decisao','generico'))
       AND to_tsvector('portuguese', coalesce(c.titulo,'') || ' ' || c.conteudo) @@ plainto_tsquery('portuguese', p_query_text)
     LIMIT 30
  ),
  cosine AS (
    SELECT c.id,
           ROW_NUMBER() OVER (ORDER BY c.embedding OPERATOR(extensions.<=>) p_query_embedding ASC) AS rk
      FROM public.admin_ia_chunks c
     WHERE c.ativo = true
       AND c.embedding IS NOT NULL
       AND (p_categoria_filter IS NULL OR c.categoria = p_categoria_filter OR c.categoria IN ('arquitetura','decisao','generico'))
     LIMIT 30
  ),
  fundido AS (
    SELECT coalesce(b.id, v.id) AS id,
           (1.0/(p_rrf_k + coalesce(b.rk, 1000))) + (1.0/(p_rrf_k + coalesce(v.rk, 1000))) AS rrf
      FROM bm25 b
      FULL OUTER JOIN cosine v ON v.id = b.id
  )
  SELECT c.id, c.titulo, c.fonte_path, c.conteudo, c.categoria, f.rrf::numeric
    FROM fundido f
    JOIN public.admin_ia_chunks c ON c.id = f.id
   ORDER BY f.rrf DESC
   LIMIT p_top_k;
END;
$function$;
;
