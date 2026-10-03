-- F1 (blueprint v3 §2/§3): busca fuzzy de produto por tenant — o LLM nunca digita UUID.
-- pg_trgm vive no schema `extensions` no Supabase → qualificar (search_path='').

CREATE INDEX IF NOT EXISTS idx_produtos_nome_trgm
  ON public.produtos USING gin (nome extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.buscar_produto_fuzzy(p_tenant_id uuid, p_termo text)
RETURNS TABLE (id uuid, nome text, descricao_curta text, pontuacao real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.nome, p.descricao_curta,
         GREATEST(
           extensions.similarity(lower(p.nome), lower(p_termo)),
           extensions.similarity(lower(coalesce(p.slug, '')), lower(p_termo)),
           (SELECT COALESCE(MAX(extensions.similarity(lower(k), lower(p_termo))), 0)
              FROM unnest(coalesce(p.palavras_chave, ARRAY[]::text[])) k)
         )::real AS pontuacao
  FROM public.produtos p
  WHERE p.user_id = p_tenant_id
    AND p.ativo = true
  ORDER BY pontuacao DESC, p.ordem NULLS LAST
  LIMIT 3;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_produto_fuzzy(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_produto_fuzzy(uuid, text) TO service_role, authenticated;
;
