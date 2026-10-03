
-- ============================================================================
-- MIGRATION: Chat Engine V6 - Motor de Agentes 100% Dinamico (Multi-Tenant)
-- Tabelas para: conversas, mensagens, leads, ficha do lead, RAG, acoes, contratos
-- ============================================================================

-- 1. Enable pgvector for hybrid search
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Add missing columns to agent_templates
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS temperatura REAL DEFAULT 0.7;
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 500;

-- Generate slugs for existing templates
UPDATE agent_templates SET slug = 'template-' || LEFT(id::text, 8) WHERE slug IS NULL;

-- 3. Leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT,
  tenant_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  phone TEXT,
  status TEXT DEFAULT 'active',
  agent_enabled BOOLEAN DEFAULT true,
  tenant_id UUID,
  channel TEXT DEFAULT 'webchat',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);
CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);

-- 5. Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

-- 6. Lead cards (ficha de acompanhamento)
CREATE TABLE IF NOT EXISTS lead_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  lead_id UUID NOT NULL REFERENCES leads(id),
  agent_id UUID NOT NULL,
  ciclo INTEGER DEFAULT 0,
  fase TEXT DEFAULT 'saudacao',
  dados_capturados JSONB DEFAULT '{}',
  resumo TEXT DEFAULT '',
  regras_completas JSONB DEFAULT '[]',
  regras_pendentes JSONB DEFAULT '[]',
  historico_fases TEXT[] DEFAULT ARRAY['saudacao'],
  ultima_acao TEXT,
  proximo_esperado TEXT,
  humanizacao_usada TEXT[] DEFAULT '{}',
  media_enviada TEXT[] DEFAULT '{}',
  objecoes_tratadas TEXT[] DEFAULT '{}',
  follow_ups_enviados INTEGER DEFAULT 0,
  fase_inicio_ciclo INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_cards_conv ON lead_cards(conversation_id);

-- 7. Knowledge chunks (RAG base with pgvector)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  embedding extensions.vector(384),
  fts TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts ON knowledge_chunks USING GIN(fts);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_agent ON knowledge_chunks(agent_id);

-- 8. Executed actions (deduplication)
CREATE TABLE IF NOT EXISTS executed_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  action_type TEXT NOT NULL,
  action_node_name TEXT NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT now(),
  result JSONB,
  UNIQUE(conversation_id, action_type, action_node_name)
);

-- 9. Scheduled actions (follow-ups, delays)
CREATE TABLE IF NOT EXISTS scheduled_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID,
  conversation_id UUID REFERENCES conversations(id),
  agent_id UUID,
  action_type TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  node_name TEXT,
  payload JSONB DEFAULT '{}',
  template TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Contracts
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  lead_id UUID,
  agent_id UUID,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  template_name TEXT,
  contract_text TEXT,
  client_data JSONB,
  status TEXT DEFAULT 'pending',
  signed_at TIMESTAMPTZ,
  signature_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. API usage logs
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  conversation_id UUID,
  request_preview TEXT,
  response_preview TEXT,
  latency_ms INTEGER,
  tenant_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Rate limits
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits(identifier, endpoint, created_at);

-- 13. Trigger updated_at for lead_cards
CREATE OR REPLACE FUNCTION update_lead_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lead_cards_updated_at ON lead_cards;
CREATE TRIGGER lead_cards_updated_at
  BEFORE UPDATE ON lead_cards
  FOR EACH ROW EXECUTE FUNCTION update_lead_cards_updated_at();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE executed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role full access (edge functions)
CREATE POLICY "srv_leads" ON leads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_conversations" ON conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_messages" ON messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_lead_cards" ON lead_cards FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_knowledge_chunks" ON knowledge_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_executed_actions" ON executed_actions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_scheduled_actions" ON scheduled_actions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_contracts" ON contracts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_api_usage_logs" ON api_usage_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_rate_limits" ON rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admin read access (authenticated users that are platform_admin)
CREATE POLICY "admin_read_leads" ON leads FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY "admin_read_conversations" ON conversations FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY "admin_read_messages" ON messages FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY "admin_read_lead_cards" ON lead_cards FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY "admin_read_knowledge_chunks" ON knowledge_chunks FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "admin_read_api_usage_logs" ON api_usage_logs FOR SELECT TO authenticated USING (is_platform_admin());

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

-- Rate limit check
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 30,
  p_window_seconds INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO rate_limits (identifier, endpoint) VALUES (p_identifier, p_endpoint);
  SELECT COUNT(*) INTO v_count
  FROM rate_limits
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND created_at > now() - (p_window_seconds || ' seconds')::interval;
  DELETE FROM rate_limits WHERE created_at < now() - interval '5 minutes';
  RETURN v_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hybrid search (FTS + Vector RRF)
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding TEXT,
  p_agent_id UUID,
  match_count INTEGER DEFAULT 5,
  full_text_weight FLOAT DEFAULT 1.2,
  semantic_weight FLOAT DEFAULT 0.8,
  rrf_k INTEGER DEFAULT 50,
  blocked_tags TEXT[] DEFAULT '{}'
) RETURNS TABLE(
  id UUID,
  title TEXT,
  content TEXT,
  category TEXT,
  tags TEXT[],
  score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH fts_results AS (
    SELECT
      kc.id,
      kc.title,
      kc.content,
      kc.category,
      kc.tags,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kc.fts, websearch_to_tsquery('portuguese', query_text)) DESC) AS rank
    FROM knowledge_chunks kc
    WHERE kc.agent_id = p_agent_id
      AND kc.fts @@ websearch_to_tsquery('portuguese', query_text)
      AND NOT (kc.tags && blocked_tags)
    LIMIT match_count * 2
  ),
  vector_results AS (
    SELECT
      kc.id,
      kc.title,
      kc.content,
      kc.category,
      kc.tags,
      ROW_NUMBER() OVER (ORDER BY kc.embedding <=> query_embedding::extensions.vector ASC) AS rank
    FROM knowledge_chunks kc
    WHERE kc.agent_id = p_agent_id
      AND kc.embedding IS NOT NULL
      AND NOT (kc.tags && blocked_tags)
    LIMIT match_count * 2
  ),
  rrf AS (
    SELECT
      COALESCE(f.id, v.id) AS id,
      COALESCE(f.title, v.title) AS title,
      COALESCE(f.content, v.content) AS content,
      COALESCE(f.category, v.category) AS category,
      COALESCE(f.tags, v.tags) AS tags,
      COALESCE(full_text_weight / (rrf_k + f.rank), 0.0) +
      COALESCE(semantic_weight / (rrf_k + v.rank), 0.0) AS score
    FROM fts_results f
    FULL OUTER JOIN vector_results v ON f.id = v.id
  )
  SELECT rrf.id, rrf.title, rrf.content, rrf.category, rrf.tags, rrf.score
  FROM rrf
  ORDER BY rrf.score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

;
