CREATE OR REPLACE FUNCTION public.busca_hibrida_manipulacao(p_query_text text, p_query_embedding extensions.halfvec, p_tenant_id uuid, p_nicho_id uuid, p_top_k integer DEFAULT 5, p_threshold numeric DEFAULT 0.65, p_rrf_k integer DEFAULT 50, p_fts_weight double precision DEFAULT 1.0, p_sem_weight double precision DEFAULT 1.0)
 RETURNS TABLE(id uuid, tipo text, severidade text, exemplos jsonb, resposta_padrao text, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_query_lower text;
BEGIN
  v_query_lower := lower(coalesce(p_query_text, ''));

  RETURN QUERY
  WITH base AS (
    SELECT mc.id, mc.tipo, mc.severidade, mc.exemplos, mc.resposta_padrao, mc.vetor_semantico
    FROM public.manipulacao_blocos mc
    WHERE mc.ativo = true
      AND mc.escopo = 'global'
  ),
  scored AS (
    SELECT
      b.id, b.tipo, b.severidade, b.exemplos, b.resposta_padrao,
      CASE
        WHEN b.vetor_semantico IS NOT NULL
          THEN (1 - (b.vetor_semantico <=> p_query_embedding))::double precision
        ELSE 0.0
      END AS sim_cosine,
      -- Match léxico: para cada exemplo do chunk, verifica se aparece (substring)
      -- na mensagem do lead OU se a mensagem aparece dentro do exemplo.
      -- Cobre cenários: "cala boca" no exemplo + msg "cala boca sua burra".
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(b.exemplos, '[]'::jsonb)) AS ex(val)
        WHERE
          length(v_query_lower) > 0
          AND length(trim(ex.val)) >= 3
          AND (
            v_query_lower LIKE '%' || lower(trim(ex.val)) || '%'
            OR position(lower(trim(ex.val)) IN v_query_lower) > 0
          )
      ) AS lex_match
    FROM base b
  )
  SELECT
    s.id, s.tipo, s.severidade, s.exemplos, s.resposta_padrao,
    -- Score final:
    --  - Quando lead repete um dos exemplos do chunk: garantia 0.85
    --  - Senão: usa cosine puro
    CASE
      WHEN s.lex_match THEN GREATEST(s.sim_cosine, 0.85)::double precision
      ELSE s.sim_cosine::double precision
    END AS score
  FROM scored s
  WHERE
    CASE
      WHEN s.lex_match THEN GREATEST(s.sim_cosine, 0.85)
      ELSE s.sim_cosine
    END >= p_threshold::double precision
  ORDER BY score DESC
  LIMIT p_top_k;
END;
$function$

