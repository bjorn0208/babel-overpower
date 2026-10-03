-- Ranking semântico de ferramentas restrito ao catálogo do cargo.
--
-- A versão anterior ranqueava TODAS as ferramentas ativas da plataforma. Como o
-- catálogo real de um cargo é um subconjunto (Mentor tem 33 marcadas, 20 chegam
-- ao payload), o top-K global gastava slots com ferramentas que o cargo nem
-- pode chamar. `p_nomes` recebe o catálogo já resolvido pelo chamador e o
-- ranking acontece dentro dele.
--
-- p_nomes NULL = comportamento antigo (ranqueia o catálogo inteiro).

set lock_timeout = '1s';
set statement_timeout = '5s';

DROP FUNCTION IF EXISTS public.ferramentas_por_similaridade(extensions.halfvec, integer, text);

CREATE OR REPLACE FUNCTION public.ferramentas_por_similaridade(
  p_query_embedding extensions.halfvec,
  p_top_k integer DEFAULT 8,
  p_escopo text DEFAULT NULL,
  p_nomes text[] DEFAULT NULL
)
RETURNS TABLE(nome_tool text, descricao text, distancia double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
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
$$;

COMMENT ON FUNCTION public.ferramentas_por_similaridade IS
  'Top-K ferramentas mais próximas semanticamente da query. p_nomes restringe ao catálogo do cargo do turno.';

;
