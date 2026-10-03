CREATE OR REPLACE FUNCTION public.busca_hibrida_pacotes(p_query_text text, p_query_embedding extensions.halfvec, p_agente_id uuid, p_match_count integer DEFAULT 16, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50)
 RETURNS TABLE(id uuid, pacote_id uuid, pacote_nome text, titulo text, conteudo text, category text, rrf_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH ligados AS (
    SELECT pc.id, pc.nome
    FROM public.pacotes_conhecimento_ativacao pa
    JOIN public.pacotes_conhecimento pc ON pc.id = pa.pacote_id
    WHERE pa.agente_id = p_agente_id
      AND pa.ligado = true
      AND public.pacote_liberado_para_tenant(pc.id, pa.tenant_id)
  ),
  base AS (
    SELECT b.*, l.nome AS pacote_nome
    FROM public.pacotes_conhecimento_blocos b
    JOIN ligados l ON l.id = b.pacote_id
    WHERE b.modo = 'relevancia' AND b.ativo = true AND b.deleted_at IS NULL
  ),
  full_text AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(b.fts, websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> '' AND b.fts @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b
    WHERE p_query_embedding IS NOT NULL AND b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding
    LIMIT 60
  )
  SELECT b.id, b.pacote_id, b.pacote_nome, b.titulo, b.conteudo, b.category,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
          + coalesce(p_semantic_weight * 1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic s ON s.id = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
$function$

