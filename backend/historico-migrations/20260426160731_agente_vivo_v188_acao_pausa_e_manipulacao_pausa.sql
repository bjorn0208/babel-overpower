-- ============================================================================
-- BLOCO 7.6 (antecipado) + extensão de manipulacao_chunks
-- ============================================================================

-- (a) Estende manipulacao_chunks com pausa+retomada opcional
ALTER TABLE public.manipulacao_chunks
  ADD COLUMN IF NOT EXISTS pausa_min integer,
  ADD COLUMN IF NOT EXISTS mensagem_retorno text;

COMMENT ON COLUMN public.manipulacao_chunks.pausa_min IS
  'Minutos de cooldown após detectar este tipo de manipulação. NULL = sem pausa.';
COMMENT ON COLUMN public.manipulacao_chunks.mensagem_retorno IS
  'Fala que o agente envia ao retomar após pausa. Usado pelo cron-retomar-agente.';

-- (b) Tabela acao_pausa_chunks (gaveta semântica de pausas genéricas)
CREATE TABLE IF NOT EXISTS public.acao_pausa_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo text NOT NULL DEFAULT 'global'
    CHECK (escopo IN ('global','nicho','tenant')),
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  gatilho_descricao text NOT NULL,
  gatilho_falas jsonb NOT NULL DEFAULT '[]'::jsonb,
  duracao_min integer NOT NULL DEFAULT 5
    CHECK (duracao_min > 0 AND duracao_min <= 1440),
  mensagem_retorno text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  embedding extensions.halfvec(1024),
  embedding_status text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending','processing','ready','failed')),
  vezes_usado integer NOT NULL DEFAULT 0,
  prioridade integer NOT NULL DEFAULT 0,
  versao integer NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now(),
  tipo_campanha text,
  criado_por uuid REFERENCES auth.users(id),
  CONSTRAINT acao_pausa_escopo_consistente CHECK (
    (escopo = 'global'  AND nicho_id IS NULL AND tenant_id IS NULL) OR
    (escopo = 'nicho'   AND nicho_id IS NOT NULL AND tenant_id IS NULL) OR
    (escopo = 'tenant'  AND tenant_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS acao_pausa_nicho_idx
  ON public.acao_pausa_chunks (nicho_id) WHERE nicho_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS acao_pausa_tenant_idx
  ON public.acao_pausa_chunks (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS acao_pausa_ativo_idx
  ON public.acao_pausa_chunks (escopo, ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS acao_pausa_embedding_idx
  ON public.acao_pausa_chunks
  USING hnsw (embedding extensions.halfvec_cosine_ops);

ALTER TABLE public.acao_pausa_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY acao_pausa_select_authenticated ON public.acao_pausa_chunks
  FOR SELECT TO authenticated
  USING (
    escopo IN ('global','nicho')
    OR (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
  );

CREATE POLICY acao_pausa_tenant_all ON public.acao_pausa_chunks
  FOR ALL TO authenticated
  USING (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
  WITH CHECK (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()));

CREATE POLICY admin_all_acao_pausa ON public.acao_pausa_chunks
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.system_role = 'platform_admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.system_role = 'platform_admin'
  ));

CREATE POLICY service_role_all_acao_pausa ON public.acao_pausa_chunks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- RPC hybrid_search pra retrieve-router (pattern padrão das outras gavetas)
CREATE OR REPLACE FUNCTION public.hybrid_search_acao_pausa(
  p_query text,
  p_query_embedding extensions.halfvec(1024),
  p_tenant_id uuid,
  p_nicho_id uuid DEFAULT NULL,
  p_match_count int DEFAULT 5,
  p_full_text_weight float DEFAULT 1.0,
  p_semantic_weight float DEFAULT 1.5,
  p_rrf_k int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  escopo text,
  gatilho_descricao text,
  gatilho_falas jsonb,
  duracao_min int,
  mensagem_retorno text,
  prioridade int,
  similarity float,
  rrf_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  WITH full_text AS (
    SELECT a.id,
      row_number() OVER (
        ORDER BY ts_rank_cd(
          to_tsvector('portuguese',
            coalesce(a.gatilho_descricao,'') || ' ' ||
            coalesce(a.gatilho_falas::text,'')
          ),
          websearch_to_tsquery('portuguese', p_query)
        ) DESC
      ) AS rank
    FROM public.acao_pausa_chunks a
    WHERE a.ativo = true
      AND (
        a.escopo = 'global'
        OR (a.escopo = 'nicho' AND a.nicho_id = p_nicho_id)
        OR (a.escopo = 'tenant' AND a.tenant_id = p_tenant_id)
      )
      AND to_tsvector('portuguese',
        coalesce(a.gatilho_descricao,'') || ' ' ||
        coalesce(a.gatilho_falas::text,'')
      ) @@ websearch_to_tsquery('portuguese', p_query)
    LIMIT p_match_count * 2
  ),
  semantic AS (
    SELECT a.id,
      row_number() OVER (ORDER BY a.embedding <=> p_query_embedding) AS rank,
      1 - (a.embedding <=> p_query_embedding) AS sim
    FROM public.acao_pausa_chunks a
    WHERE a.ativo = true
      AND a.embedding IS NOT NULL
      AND (
        a.escopo = 'global'
        OR (a.escopo = 'nicho' AND a.nicho_id = p_nicho_id)
        OR (a.escopo = 'tenant' AND a.tenant_id = p_tenant_id)
      )
    ORDER BY a.embedding <=> p_query_embedding
    LIMIT p_match_count * 2
  )
  SELECT
    a.id,
    a.escopo,
    a.gatilho_descricao,
    a.gatilho_falas,
    a.duracao_min,
    a.mensagem_retorno,
    a.prioridade,
    coalesce(s.sim, 0)::float AS similarity,
    (
      coalesce(1.0 / (p_rrf_k + ft.rank), 0) * p_full_text_weight +
      coalesce(1.0 / (p_rrf_k + s.rank), 0) * p_semantic_weight
    )::float AS rrf_score
  FROM public.acao_pausa_chunks a
  LEFT JOIN full_text ft ON ft.id = a.id
  LEFT JOIN semantic  s  ON s.id = a.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hybrid_search_acao_pausa
  TO authenticated, service_role;

COMMENT ON TABLE public.acao_pausa_chunks IS
  'Gaveta semântica de pausas genéricas (café · banheiro · checar com equipe). Hybrid search pra LLM emitir tag e handler agendar cron-retomar-agente.';
;
