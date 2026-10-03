-- Admin IA · Dia 1 · Backbone (audit + RAG dedicado)
-- Plano: docs/planejamento/admin-ia-v1.md

-- =========================================================================
-- 1) admin_ia_actions — audit imutável de tool calls
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.admin_ia_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   uuid NOT NULL,
  conversation_id uuid,
  skill           text NOT NULL CHECK (skill IN ('curadoria','atendimento','campanha','base','sistema')),
  tool_name       text NOT NULL,
  arguments_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  dry_run         boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aplicada','rejeitada','erro')),
  resultado_json  jsonb,
  erro            text,
  latencia_ms     integer,
  modelo_slug     text,
  preview_diff    jsonb,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  aplicado_em     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_ia_actions_actor      ON public.admin_ia_actions (actor_user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_admin_ia_actions_skill_tool ON public.admin_ia_actions (skill, tool_name);
CREATE INDEX IF NOT EXISTS idx_admin_ia_actions_status     ON public.admin_ia_actions (status) WHERE status IN ('pendente','erro');
CREATE INDEX IF NOT EXISTS idx_admin_ia_actions_conv       ON public.admin_ia_actions (conversation_id) WHERE conversation_id IS NOT NULL;

ALTER TABLE public.admin_ia_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_ia_actions_admin_only_select" ON public.admin_ia_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.system_role IN ('admin','superadmin')
    )
  );

CREATE POLICY "admin_ia_actions_admin_only_insert" ON public.admin_ia_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.system_role IN ('admin','superadmin')
    )
  );

CREATE POLICY "admin_ia_actions_service_role_update" ON public.admin_ia_actions
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.admin_ia_actions IS
'Audit imutável de tool calls do Admin IA. INSERT no momento que LLM propõe. UPDATE apenas via service_role da edge admin-ia. Sem DELETE (compliance).';

-- =========================================================================
-- 2) admin_ia_chunks — RAG dedicado do agente
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.admin_ia_chunks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo            text NOT NULL,
  fonte_path        text NOT NULL,
  fonte_secao       text,
  categoria         text NOT NULL CHECK (categoria IN ('curadoria','atendimento','campanha','base','arquitetura','decisao','memoria','automacao','prompt','generico')),
  conteudo          text NOT NULL,
  tags              text[] NOT NULL DEFAULT '{}'::text[],
  embedding         halfvec(1536),
  embedding_status  text NOT NULL DEFAULT 'pending' CHECK (embedding_status IN ('pending','ready','error')),
  versao            integer NOT NULL DEFAULT 1,
  ativo             boolean NOT NULL DEFAULT true,
  vezes_usado       integer NOT NULL DEFAULT 0,
  fonte_hash        text,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_ia_chunks_categoria ON public.admin_ia_chunks (categoria) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_admin_ia_chunks_tags      ON public.admin_ia_chunks USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_admin_ia_chunks_fts       ON public.admin_ia_chunks USING gin (to_tsvector('portuguese', coalesce(titulo,'') || ' ' || conteudo));
CREATE INDEX IF NOT EXISTS idx_admin_ia_chunks_embedding ON public.admin_ia_chunks USING hnsw (embedding halfvec_cosine_ops) WHERE embedding IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_ia_chunks_hash ON public.admin_ia_chunks (fonte_hash) WHERE fonte_hash IS NOT NULL;

ALTER TABLE public.admin_ia_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_ia_chunks_admin_only" ON public.admin_ia_chunks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.system_role IN ('admin','superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.system_role IN ('admin','superadmin')
    )
  );

CREATE POLICY "admin_ia_chunks_service_role_all" ON public.admin_ia_chunks
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.admin_ia_chunks IS
'RAG dedicado do agente Admin IA. Conhecimento sobre como a plataforma funciona. Ingerido via scripts/admin-ia/ingest-docs.ts. Reranking via Cohere v3.5 a cada turno.';

-- trigger atualizado_em
CREATE OR REPLACE FUNCTION public.tg_admin_ia_chunks_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_ia_chunks_updated ON public.admin_ia_chunks;
CREATE TRIGGER trg_admin_ia_chunks_updated
  BEFORE UPDATE ON public.admin_ia_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_admin_ia_chunks_updated();

-- =========================================================================
-- 3) RPC hybrid_search_admin_ia
-- =========================================================================
CREATE OR REPLACE FUNCTION public.hybrid_search_admin_ia(
  p_query_text       text,
  p_query_embedding  halfvec(1536),
  p_categoria_filter text DEFAULT NULL,
  p_top_k            integer DEFAULT 8,
  p_rrf_k            integer DEFAULT 60
)
RETURNS TABLE (
  id          uuid,
  titulo      text,
  fonte_path  text,
  conteudo    text,
  categoria   text,
  rrf_score   numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
           ROW_NUMBER() OVER (ORDER BY c.embedding <=> p_query_embedding ASC) AS rk
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
$$;

COMMENT ON FUNCTION public.hybrid_search_admin_ia IS
'Retrieval híbrido (BM25 + cosine + RRF fusion) para o Admin IA. Pré-rerank — top_k vai pra Cohere rerank-v3.5 no edge.';

-- pgmq enqueue de embedding
CREATE OR REPLACE FUNCTION public.tg_admin_ia_chunks_enqueue_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.embedding_status = 'pending' AND NEW.embedding IS NULL THEN
    PERFORM pgmq.send(
      'embedding_jobs',
      jsonb_build_object(
        'tabela', 'admin_ia_chunks',
        'id', NEW.id,
        'texto', coalesce(NEW.titulo,'') || E'\n\n' || NEW.conteudo,
        'modelo', 'cohere-embed-v4.0',
        'dim', 1536
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_ia_chunks_embed ON public.admin_ia_chunks;
CREATE TRIGGER trg_admin_ia_chunks_embed
  AFTER INSERT OR UPDATE OF conteudo, titulo, embedding_status ON public.admin_ia_chunks
  FOR EACH ROW
  WHEN (NEW.embedding_status = 'pending')
  EXECUTE FUNCTION public.tg_admin_ia_chunks_enqueue_embedding();
;
