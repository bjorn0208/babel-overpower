-- ================================================================================
-- SAAS AGENT IA WHITE LABEL - SCHEMA COMPLETO
-- ================================================================================

-- Ativar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================================
-- TABELA: profiles (Usuários/Clientes do SaaS)
-- ================================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'client' CHECK (role IN ('admin', 'client', 'support')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para criar profile automaticamente no signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================================================
-- TABELA: agents (Agentes de IA)
-- ================================================================================
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_name TEXT,
  slug TEXT UNIQUE,
  avatar_url TEXT,
  personality TEXT,
  style TEXT DEFAULT 'informal' CHECK (style IN ('formal', 'informal')),
  gender TEXT DEFAULT 'neutro' CHECK (gender IN ('masculino', 'feminino', 'neutro')),
  business_segment TEXT,
  fallback_to_human BOOLEAN DEFAULT false,
  fallback_keywords TEXT,
  fallback_after_minutes INTEGER DEFAULT 5,
  whatsapp TEXT,
  reservation_url TEXT,
  menu_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_premium BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents(slug);
CREATE INDEX IF NOT EXISTS idx_agents_is_active ON agents(is_active);

-- ================================================================================
-- TABELA: stores (Lojas/Unidades - Multi-tenant)
-- ================================================================================
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT,
  address TEXT,
  phone TEXT,
  whatsapp TEXT,
  google_maps_url TEXT,
  business_hours JSONB DEFAULT '{
    "seg": {"enabled": false, "shifts": []},
    "ter": {"enabled": true, "shifts": [{"open": "09:00", "close": "18:00"}]},
    "qua": {"enabled": true, "shifts": [{"open": "09:00", "close": "18:00"}]},
    "qui": {"enabled": true, "shifts": [{"open": "09:00", "close": "18:00"}]},
    "sex": {"enabled": true, "shifts": [{"open": "09:00", "close": "18:00"}]},
    "sab": {"enabled": true, "shifts": [{"open": "09:00", "close": "14:00"}]},
    "dom": {"enabled": false, "shifts": []}
  }'::jsonb,
  is_active BOOLEAN DEFAULT true,
  is_main BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stores_agent_id ON stores(agent_id);
CREATE INDEX IF NOT EXISTS idx_stores_is_active ON stores(is_active);

-- ================================================================================
-- TABELA: conversations (Conversas com clientes)
-- ================================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  customer_identifier TEXT,
  customer_name TEXT DEFAULT 'Visitante',
  customer_phone TEXT,
  customer_email TEXT,
  channel TEXT DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp', 'telegram', 'instagram', 'api')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'waiting_human', 'closed', 'archived')),
  ai_enabled BOOLEAN DEFAULT true,
  transferred_to_human BOOLEAN DEFAULT false,
  transfer_reason TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_agent_id ON conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_store_id ON conversations(store_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- ================================================================================
-- TABELA: messages (Mensagens das conversas)
-- ================================================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  hallucination_detected BOOLEAN DEFAULT false,
  hallucination_type TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- ================================================================================
-- TABELA: knowledge_items (Base de Conhecimento)
-- ================================================================================
CREATE TABLE IF NOT EXISTS knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN (
    'price', 'product', 'hours', 'location', 'contact',
    'reservation', 'delivery', 'payment', 'promotion', 'general'
  )),
  image_url TEXT,
  file_url TEXT,
  file_name TEXT,
  buttons JSONB DEFAULT '[]',
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_agent_id ON knowledge_items(agent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_store_id ON knowledge_items(store_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_items(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_is_active ON knowledge_items(is_active);
CREATE INDEX IF NOT EXISTS idx_knowledge_question_trgm ON knowledge_items USING gin (question gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_knowledge_answer_trgm ON knowledge_items USING gin (answer gin_trgm_ops);

-- ================================================================================
-- TABELA: quick_actions (Ações rápidas do agente)
-- ================================================================================
CREATE TABLE IF NOT EXISTS quick_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  message TEXT NOT NULL,
  emoji TEXT DEFAULT '💬',
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_actions_agent_id ON quick_actions(agent_id);

-- ================================================================================
-- TABELA: custom_buttons (Botões customizados globais)
-- ================================================================================
CREATE TABLE IF NOT EXISTS custom_buttons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  emoji TEXT DEFAULT '🔗',
  color TEXT DEFAULT 'blue',
  trigger_keywords TEXT[],
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_buttons_agent_id ON custom_buttons(agent_id);

-- ================================================================================
-- TABELA: security_patterns (Padrões de segurança)
-- ================================================================================
CREATE TABLE IF NOT EXISTS security_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_name TEXT NOT NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'prompt_injection', 'jailbreak', 'manipulation',
    'data_extraction', 'abuse', 'commercial_manipulation', 'spam'
  )),
  pattern_text TEXT NOT NULL,
  pattern_keywords TEXT[],
  pattern_regex TEXT,
  similarity_threshold DECIMAL(3,2) DEFAULT 0.45,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  prepared_response TEXT,
  prepared_response_informal TEXT,
  should_block BOOLEAN DEFAULT true,
  times_triggered INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_patterns_type ON security_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_security_patterns_active ON security_patterns(is_active);

-- ================================================================================
-- TABELA: security_incidents (Log de incidentes)
-- ================================================================================
CREATE TABLE IF NOT EXISTS security_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  pattern_id UUID REFERENCES security_patterns(id) ON DELETE SET NULL,
  original_message TEXT NOT NULL,
  detected_type TEXT,
  detection_method TEXT CHECK (detection_method IN ('regex', 'keywords', 'similarity')),
  similarity_score DECIMAL(5,4),
  was_blocked BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_agent ON security_incidents(agent_id);
CREATE INDEX IF NOT EXISTS idx_security_incidents_created ON security_incidents(created_at DESC);

-- ================================================================================
-- TABELA: verification_responses (Respostas de verificação anti-alucinação)
-- ================================================================================
CREATE TABLE IF NOT EXISTS verification_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'price_hallucination', 'product_hallucination',
    'info_hallucination', 'general_uncertainty'
  )),
  response_formal TEXT NOT NULL,
  response_informal TEXT NOT NULL,
  follow_up_formal TEXT,
  follow_up_informal TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================================
-- TABELA: unanswered_questions (Perguntas não respondidas)
-- ================================================================================
CREATE TABLE IF NOT EXISTS unanswered_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  agent_response TEXT,
  category TEXT DEFAULT 'general',
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  resolution_notes TEXT,
  is_spam BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unanswered_agent ON unanswered_questions(agent_id);
CREATE INDEX IF NOT EXISTS idx_unanswered_resolved ON unanswered_questions(is_resolved);

-- ================================================================================
-- TABELA: api_keys (Chaves de API - Groq, OpenAI, etc)
-- ================================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  key_value TEXT NOT NULL,
  provider VARCHAR(50) DEFAULT 'groq' CHECK (provider IN ('groq', 'openai', 'anthropic', 'local', 'openrouter')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================================
-- TABELA: api_usage (Tracking de uso de API)
-- ================================================================================
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  endpoint VARCHAR(255),
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  cost DECIMAL(10, 6) DEFAULT 0,
  cost_input DECIMAL(12, 8) DEFAULT 0,
  cost_output DECIMAL(12, 8) DEFAULT 0,
  cost_total DECIMAL(12, 8) DEFAULT 0,
  model VARCHAR(100) DEFAULT 'llama-3.3-70b-versatile',
  agent_name VARCHAR(255),
  client_name VARCHAR(255),
  request_type VARCHAR(50) DEFAULT 'chat',
  response_time_ms INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'success',
  error_message TEXT,
  blocked_by_security BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_agent ON api_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at DESC);

-- ================================================================================
-- TABELA: plans (Planos do SaaS)
-- ================================================================================
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  price_monthly INTEGER DEFAULT 0,
  price_yearly INTEGER DEFAULT 0,
  max_agents INTEGER DEFAULT 1,
  max_stores_per_agent INTEGER DEFAULT 1,
  max_knowledge_items INTEGER DEFAULT 50,
  max_conversations_month INTEGER DEFAULT 100,
  max_tokens_month INTEGER DEFAULT 100000,
  features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================================
-- TABELA: subscriptions (Assinaturas)
-- ================================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  external_id TEXT,
  external_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ================================================================================
-- TABELA: analytics_daily (Analytics diário)
-- ================================================================================
CREATE TABLE IF NOT EXISTS analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_conversations INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  blocked_messages INTEGER DEFAULT 0,
  positive_ratings INTEGER DEFAULT 0,
  negative_ratings INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_agent_date ON analytics_daily(agent_id, date DESC);

-- ================================================================================
-- TABELA: tenant_permissions (Permissões customizadas)
-- ================================================================================
CREATE TABLE IF NOT EXISTS tenant_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  permission_value JSONB DEFAULT '{"enabled": true}'::jsonb,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_permissions_user ON tenant_permissions(user_id);

-- ================================================================================
-- TABELA: tenant_quotas (Quotas por tenant)
-- ================================================================================
CREATE TABLE IF NOT EXISTS tenant_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  max_agents INTEGER DEFAULT 1,
  max_stores_per_agent INTEGER DEFAULT 5,
  max_knowledge_items INTEGER DEFAULT 100,
  max_custom_buttons INTEGER DEFAULT 10,
  max_tokens_per_month INTEGER DEFAULT 1000000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- ================================================================================
-- TABELA: system_settings (Configurações do sistema)
-- ================================================================================
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- ================================================================================
-- TABELA: special_hours (Horários especiais)
-- ================================================================================
CREATE TABLE IF NOT EXISTS special_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  shifts JSONB DEFAULT '[]',
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_special_hours_store ON special_hours(store_id);
CREATE INDEX IF NOT EXISTS idx_special_hours_date ON special_hours(date);

-- ================================================================================
-- TABELA: special_events (Eventos especiais)
-- ================================================================================
CREATE TABLE IF NOT EXISTS special_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  agent_message TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_special_events_agent ON special_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_special_events_dates ON special_events(start_date, end_date);

-- ================================================================================
-- TABELA: support_messages (Mensagens de suporte)
-- ================================================================================
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject TEXT,
  message TEXT NOT NULL,
  admin_response TEXT,
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_user ON support_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_messages(status);
CREATE INDEX IF NOT EXISTS idx_support_read ON support_messages(read);

-- ================================================================================
-- HABILITAR REALTIME PARA TABELAS IMPORTANTES
-- ================================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE api_usage;
;
