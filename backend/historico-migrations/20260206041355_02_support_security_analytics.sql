
-- ================================================================================
-- LIMPA NOME IA - TABELAS DE SUPORTE, SEGURANCA E ANALYTICS
-- ================================================================================

-- quick_actions
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

-- custom_buttons
CREATE TABLE IF NOT EXISTS custom_buttons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  emoji TEXT DEFAULT '🔗',
  color TEXT DEFAULT 'purple',
  trigger_keywords TEXT[],
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_buttons_agent_id ON custom_buttons(agent_id);

-- security_patterns
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

-- security_incidents
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

-- verification_responses (anti-alucinacao)
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

-- unanswered_questions
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

-- api_keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  key_value TEXT NOT NULL,
  provider VARCHAR(50) DEFAULT 'openrouter' CHECK (provider IN ('groq', 'openai', 'anthropic', 'openrouter', 'local')),
  model VARCHAR(100) DEFAULT 'qwen/qwen-2.5-72b-instruct',
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  requests_today INTEGER DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  rate_limited_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- api_usage
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  endpoint VARCHAR(255),
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_input DECIMAL(12, 8) DEFAULT 0,
  cost_output DECIMAL(12, 8) DEFAULT 0,
  cost_total DECIMAL(12, 8) DEFAULT 0,
  model VARCHAR(100),
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

-- plans
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

-- subscriptions
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

-- analytics_daily
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

-- tenant_permissions
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

-- tenant_quotas
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

-- system_settings
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- special_hours
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

-- special_events
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

-- support_messages
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

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE api_usage;

;
