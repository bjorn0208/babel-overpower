
-- Sprint C · Migration 007 · episodic_memory + RPC hybrid_search_episodic

CREATE TABLE IF NOT EXISTS public.episodic_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,

  episodio_resumo text NOT NULL,
  gancho text NULL,
  emocao text NULL,

  turno_inicio int NOT NULL,
  turno_fim int NOT NULL,
  duracao_turnos int GENERATED ALWAYS AS (turno_fim - turno_inicio + 1) STORED,

  relevancia numeric(3,2) NOT NULL DEFAULT 0.50 CHECK (relevancia >= 0 AND relevancia <= 1),
  decay_factor numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (decay_factor >= 0 AND decay_factor <= 1),

  embedding extensions.vector(1024) NULL,
  embedding_status text NOT NULL DEFAULT 'pending' CHECK (embedding_status IN ('pending','processing','done','failed')),

  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ativa boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.episodic_memory IS 'Memória episódica do agente — momentos da conversa que viraram lembrança consultável. Decay via cron decay-episodios.';
COMMENT ON COLUMN public.episodic_memory.gancho IS 'Frase-chave evocativa que o agente pode usar pra puxar a lembrança ("lembra quando você me disse...").';
COMMENT ON COLUMN public.episodic_memory.decay_factor IS 'Fator de decaimento (1.0=novo, vai pra 0.0 com tempo via cron). Multiplicador na relevancia efetiva.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_episodic_memory_conversation
  ON public.episodic_memory (tenant_id, conversation_id);

CREATE INDEX IF NOT EXISTS idx_episodic_memory_lead
  ON public.episodic_memory (tenant_id, lead_id)
  WHERE lead_id IS NOT NULL AND ativa = true;

CREATE INDEX IF NOT EXISTS idx_episodic_memory_recentes
  ON public.episodic_memory (tenant_id, criado_em DESC)
  WHERE ativa = true;

CREATE INDEX IF NOT EXISTS idx_episodic_memory_embedding_pending
  ON public.episodic_memory (criado_em)
  WHERE embedding_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_episodic_memory_embedding_hnsw
  ON public.episodic_memory USING hnsw (embedding extensions.vector_cosine_ops);

-- RLS
ALTER TABLE public.episodic_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_all" ON public.episodic_memory
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));

CREATE POLICY "service_role_all" ON public.episodic_memory
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Trigger updated_at (reusa fn set_updated_at criada na fase 1 RAG)
CREATE TRIGGER trg_set_updated_at_episodic_memory
  BEFORE UPDATE ON public.episodic_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger enqueue embedding (mesmo padrão das outras 5 gavetas)
CREATE OR REPLACE FUNCTION public.trg_enqueue_embedding_episodic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.embedding_status = 'pending' AND NEW.episodio_resumo IS NOT NULL THEN
    PERFORM extensions.pg_net.http_post(
      url := current_setting('app.settings.edge_url', true) || '/gerar-embedding',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'tabela','episodic_memory',
        'id', NEW.id,
        'texto', NEW.episodio_resumo
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enqueue_embedding_episodic_after_insert
  AFTER INSERT ON public.episodic_memory
  FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_embedding_episodic();

-- RPC hybrid_search_episodic
CREATE OR REPLACE FUNCTION public.hybrid_search_episodic(
  p_query_text text,
  p_query_embedding extensions.vector(1024),
  p_tenant_id uuid,
  p_lead_id uuid DEFAULT NULL,
  p_match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  lead_id uuid,
  episodio_resumo text,
  gancho text,
  emocao text,
  relevancia_efetiva numeric,
  similarity numeric,
  criado_em timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    em.id,
    em.conversation_id,
    em.lead_id,
    em.episodio_resumo,
    em.gancho,
    em.emocao,
    (em.relevancia * em.decay_factor)::numeric AS relevancia_efetiva,
    (1 - (em.embedding <=> p_query_embedding))::numeric AS similarity,
    em.criado_em
  FROM public.episodic_memory em
  WHERE em.tenant_id = p_tenant_id
    AND em.ativa = true
    AND em.embedding IS NOT NULL
    AND (p_lead_id IS NULL OR em.lead_id = p_lead_id)
  ORDER BY (em.embedding <=> p_query_embedding) ASC, (em.relevancia * em.decay_factor) DESC
  LIMIT p_match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.hybrid_search_episodic(text, extensions.vector, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hybrid_search_episodic(text, extensions.vector, uuid, uuid, int) TO authenticated, service_role;

;
