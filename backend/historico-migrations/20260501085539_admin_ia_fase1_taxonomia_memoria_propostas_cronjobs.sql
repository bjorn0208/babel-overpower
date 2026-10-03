-- ========================================================================
-- Admin IA · Fase 1 · Taxonomia + Memória + Propostas + Cronjobs
-- ========================================================================

-- 1. Reformar admin_ia_chunks (RAG taxonômico)
ALTER TABLE public.admin_ia_chunks
  ADD COLUMN IF NOT EXISTS tipo TEXT,
  ADD COLUMN IF NOT EXISTS modulo TEXT,
  ADD COLUMN IF NOT EXISTS aba TEXT,
  ADD COLUMN IF NOT EXISTS evidencia TEXT;

ALTER TABLE public.admin_ia_chunks
  DROP CONSTRAINT IF EXISTS admin_ia_chunks_tipo_check;
ALTER TABLE public.admin_ia_chunks
  ADD CONSTRAINT admin_ia_chunks_tipo_check
  CHECK (tipo IS NULL OR tipo IN ('mapa', 'playbook', 'anti_padrao', 'exemplo', 'metrica', 'glossario'));

ALTER TABLE public.admin_ia_chunks
  DROP CONSTRAINT IF EXISTS admin_ia_chunks_modulo_check;
ALTER TABLE public.admin_ia_chunks
  ADD CONSTRAINT admin_ia_chunks_modulo_check
  CHECK (modulo IS NULL OR modulo IN ('curadoria', 'atendimento', 'campanha', 'base', 'sistema', 'admin'));

CREATE INDEX IF NOT EXISTS idx_admin_ia_chunks_tipo ON public.admin_ia_chunks (tipo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_admin_ia_chunks_modulo ON public.admin_ia_chunks (modulo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_admin_ia_chunks_tipo_modulo ON public.admin_ia_chunks (tipo, modulo) WHERE ativo = true;

-- 2. admin_ia_memoria (lições, preferências, compromissos)
CREATE TABLE IF NOT EXISTS public.admin_ia_memoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('licao', 'preferencia', 'compromisso', 'observacao')),
  conteudo TEXT NOT NULL,
  modulo TEXT CHECK (modulo IS NULL OR modulo IN ('curadoria', 'atendimento', 'campanha', 'base', 'sistema', 'admin')),
  embedding halfvec(1536),
  embedding_status TEXT DEFAULT 'pending' CHECK (embedding_status IN ('pending', 'ready', 'failed', 'error')),
  origem TEXT DEFAULT 'manual' CHECK (origem IN ('manual', 'agente', 'cron_aprendiz')),
  criado_por UUID,
  ultima_uso TIMESTAMPTZ,
  vezes_usada INTEGER NOT NULL DEFAULT 0,
  score_relevancia NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  ativa BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_ia_memoria_tipo ON public.admin_ia_memoria (tipo) WHERE ativa = true;
CREATE INDEX IF NOT EXISTS idx_admin_ia_memoria_modulo ON public.admin_ia_memoria (modulo) WHERE ativa = true;
CREATE INDEX IF NOT EXISTS idx_admin_ia_memoria_embedding ON public.admin_ia_memoria USING hnsw (embedding halfvec_cosine_ops) WHERE ativa = true;

ALTER TABLE public.admin_ia_memoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_ia_memoria_platform_admin ON public.admin_ia_memoria FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'));

-- 3. admin_ia_propostas (toda mutação vira proposta antes de aplicar)
CREATE TABLE IF NOT EXISTS public.admin_ia_propostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID,
  proposta_por_user_id UUID,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'rag_admin_chunk', 'rag_admin_chunk_edit',
    'chunk_platform', 'chunk_platform_edit',
    'mudanca_fase', 'mudanca_pipeline',
    'vocab_canonico', 'vocab_alias',
    'automacao_semantica', 'threshold',
    'override_tenant', 'cronjob'
  )),
  titulo TEXT NOT NULL,
  payload JSONB NOT NULL,
  preview_diff JSONB,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'recusada', 'aplicada', 'erro')),
  raciocinio TEXT,
  aplicada_em TIMESTAMPTZ,
  aplicada_por UUID,
  recusada_em TIMESTAMPTZ,
  recusada_por UUID,
  motivo_recusa TEXT,
  resultado_aplicacao JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_ia_propostas_status ON public.admin_ia_propostas (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_admin_ia_propostas_tipo ON public.admin_ia_propostas (tipo) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_admin_ia_propostas_conversation ON public.admin_ia_propostas (conversation_id) WHERE conversation_id IS NOT NULL;

ALTER TABLE public.admin_ia_propostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_ia_propostas_platform_admin ON public.admin_ia_propostas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'));

-- 4. admin_ia_relatorios (cron gerente diário)
CREATE TABLE IF NOT EXISTS public.admin_ia_relatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('diario', 'semanal', 'alerta', 'manual')),
  periodo_inicio TIMESTAMPTZ NOT NULL,
  periodo_fim TIMESTAMPTZ NOT NULL,
  resumo TEXT NOT NULL,
  metricas JSONB NOT NULL DEFAULT '{}'::jsonb,
  alertas JSONB NOT NULL DEFAULT '[]'::jsonb,
  lido BOOLEAN NOT NULL DEFAULT false,
  lido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_ia_relatorios_periodo ON public.admin_ia_relatorios (periodo_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_admin_ia_relatorios_lido ON public.admin_ia_relatorios (lido, criado_em DESC);

ALTER TABLE public.admin_ia_relatorios ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_ia_relatorios_platform_admin ON public.admin_ia_relatorios FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'));

-- 5. admin_ia_cronjobs (agente propõe cron pra ele mesmo, admin aprova)
CREATE TABLE IF NOT EXISTS public.admin_ia_cronjobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  schedule_cron TEXT NOT NULL,
  acao_tipo TEXT NOT NULL CHECK (acao_tipo IN ('varredura_metricas', 'destilar_feedback', 'detectar_gap', 'limpar_memoria', 'edge_call', 'sql_select')),
  acao_payload JSONB NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT false,
  pg_cron_job_id BIGINT,
  ultima_execucao TIMESTAMPTZ,
  ultimo_resultado JSONB,
  ultimo_status TEXT,
  proposto_por_agente BOOLEAN NOT NULL DEFAULT false,
  aprovado_em TIMESTAMPTZ,
  aprovado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_ia_cronjobs_ativo ON public.admin_ia_cronjobs (ativo) WHERE ativo = true;

ALTER TABLE public.admin_ia_cronjobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_ia_cronjobs_platform_admin ON public.admin_ia_cronjobs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'));

-- 6. RPC busca taxonômica (substitui hybrid_search_admin_ia genérico)
CREATE OR REPLACE FUNCTION public.search_admin_ia_chunks_taxonomico(
  p_query_text TEXT,
  p_query_embedding halfvec(1536),
  p_tipo TEXT DEFAULT NULL,
  p_modulo TEXT DEFAULT NULL,
  p_top_k INT DEFAULT 5,
  p_rrf_k INT DEFAULT 60
)
RETURNS TABLE (
  id UUID, titulo TEXT, fonte_path TEXT, conteudo TEXT,
  categoria TEXT, tipo TEXT, modulo TEXT, aba TEXT,
  rrf_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH
  q_full AS (
    SELECT websearch_to_tsquery('portuguese', coalesce(p_query_text, '')) AS tsq
  ),
  bm25 AS (
    SELECT c.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', coalesce(c.titulo,'')||' '||coalesce(c.conteudo,'')), q.tsq) DESC) AS rnk
    FROM public.admin_ia_chunks c, q_full q
    WHERE c.ativo = true AND c.embedding_status = 'ready'
      AND (p_tipo IS NULL OR c.tipo = p_tipo)
      AND (p_modulo IS NULL OR c.modulo = p_modulo OR c.modulo = 'sistema')
      AND to_tsvector('portuguese', coalesce(c.titulo,'')||' '||coalesce(c.conteudo,'')) @@ q.tsq
    LIMIT 50
  ),
  vec AS (
    SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.embedding <=> p_query_embedding) AS rnk
    FROM public.admin_ia_chunks c
    WHERE c.ativo = true AND c.embedding IS NOT NULL AND c.embedding_status = 'ready'
      AND (p_tipo IS NULL OR c.tipo = p_tipo)
      AND (p_modulo IS NULL OR c.modulo = p_modulo OR c.modulo = 'sistema')
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT 50
  ),
  fused AS (
    SELECT u.id,
      COALESCE(SUM(1.0 / (p_rrf_k + b.rnk)), 0) + COALESCE(SUM(1.0 / (p_rrf_k + v.rnk)), 0) AS score
    FROM (SELECT id FROM bm25 UNION SELECT id FROM vec) u
    LEFT JOIN bm25 b ON b.id = u.id
    LEFT JOIN vec v ON v.id = u.id
    GROUP BY u.id
  )
  SELECT c.id, c.titulo, c.fonte_path, c.conteudo,
         c.categoria, c.tipo, c.modulo, c.aba,
         f.score::numeric AS rrf_score
  FROM fused f
  JOIN public.admin_ia_chunks c ON c.id = f.id
  ORDER BY f.score DESC
  LIMIT p_top_k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_admin_ia_chunks_taxonomico TO authenticated, service_role;

-- 7. RPC busca em memória (semântica)
CREATE OR REPLACE FUNCTION public.search_admin_ia_memoria(
  p_query_text TEXT,
  p_query_embedding halfvec(1536),
  p_tipo TEXT DEFAULT NULL,
  p_modulo TEXT DEFAULT NULL,
  p_top_k INT DEFAULT 10
)
RETURNS TABLE (
  id UUID, tipo TEXT, conteudo TEXT, modulo TEXT,
  score_relevancia NUMERIC, vezes_usada INT,
  similaridade NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_query_embedding IS NULL THEN
    RETURN QUERY
    SELECT m.id, m.tipo, m.conteudo, m.modulo,
           m.score_relevancia, m.vezes_usada,
           0::numeric AS similaridade
    FROM public.admin_ia_memoria m
    WHERE m.ativa = true
      AND (p_tipo IS NULL OR m.tipo = p_tipo)
      AND (p_modulo IS NULL OR m.modulo = p_modulo OR m.modulo IS NULL)
    ORDER BY m.score_relevancia DESC, m.criado_em DESC
    LIMIT p_top_k;
  ELSE
    RETURN QUERY
    SELECT m.id, m.tipo, m.conteudo, m.modulo,
           m.score_relevancia, m.vezes_usada,
           (1 - (m.embedding <=> p_query_embedding))::numeric AS similaridade
    FROM public.admin_ia_memoria m
    WHERE m.ativa = true AND m.embedding IS NOT NULL AND m.embedding_status = 'ready'
      AND (p_tipo IS NULL OR m.tipo = p_tipo)
      AND (p_modulo IS NULL OR m.modulo = p_modulo OR m.modulo IS NULL)
    ORDER BY m.embedding <=> p_query_embedding
    LIMIT p_top_k;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_admin_ia_memoria TO authenticated, service_role;

-- 8. Trigger pgmq pra embedding em admin_ia_memoria (mesmo padrão dos chunks)
CREATE OR REPLACE FUNCTION public.enfileirar_embedding_admin_ia_memoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (NEW.conteudo IS DISTINCT FROM OLD.conteudo) OR (TG_OP = 'INSERT') THEN
    NEW.embedding_status := 'pending';
    NEW.embedding := NULL;
    PERFORM pgmq.send(
      'embedding_jobs',
      jsonb_build_object(
        'table', 'admin_ia_memoria',
        'row_id', NEW.id::text,
        'text', NEW.conteudo
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_ia_memoria_embedding ON public.admin_ia_memoria;
CREATE TRIGGER trg_admin_ia_memoria_embedding
  BEFORE INSERT OR UPDATE OF conteudo ON public.admin_ia_memoria
  FOR EACH ROW EXECUTE FUNCTION public.enfileirar_embedding_admin_ia_memoria();

-- 9. updated_at trigger pra admin_ia_memoria
CREATE OR REPLACE FUNCTION public.tg_admin_ia_memoria_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_ia_memoria_updated_at ON public.admin_ia_memoria;
CREATE TRIGGER trg_admin_ia_memoria_updated_at
  BEFORE UPDATE ON public.admin_ia_memoria
  FOR EACH ROW EXECUTE FUNCTION public.tg_admin_ia_memoria_updated_at();
;
