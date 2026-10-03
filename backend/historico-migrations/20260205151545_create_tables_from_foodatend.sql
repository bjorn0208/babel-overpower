
-- ===============================================
-- MIGRATION: CREATE ALL TABLES (from FoodAtend)
-- ===============================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- ==================== PROFILES ====================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== PLANS ====================
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC DEFAULT 0,
  max_conversations_month INTEGER DEFAULT 1000,
  max_messages_month INTEGER DEFAULT 10000,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== SUBSCRIPTIONS ====================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'cancelled', 'expired')),
  starts_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  conversations_used INTEGER DEFAULT 0,
  messages_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== AGENTS ====================
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Assistente',
  avatar_url TEXT,
  gender TEXT DEFAULT 'neutro' CHECK (gender IN ('masculino', 'feminino', 'neutro')),
  style TEXT DEFAULT 'informal' CHECK (style IN ('formal', 'informal')),
  personality TEXT,
  welcome_message TEXT,
  business_name TEXT,
  business_type TEXT,
  business_description TEXT,
  business_address TEXT,
  whatsapp_phone TEXT,
  instagram TEXT,
  phone TEXT,
  google_maps_url TEXT,
  reservation_url TEXT,
  show_reservation_button BOOLEAN DEFAULT true,
  show_whatsapp_button BOOLEAN DEFAULT true,
  fallback_to_human BOOLEAN DEFAULT true,
  fallback_keywords TEXT,
  business_days JSONB DEFAULT '{"dom": true, "qua": true, "qui": true, "sab": true, "seg": false, "sex": true, "ter": true}',
  business_open TIME DEFAULT '19:00',
  business_close TIME DEFAULT '23:00',
  public_slug TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  openai_api_key TEXT,
  multi_store_greeting TEXT DEFAULT 'Olá! Em qual unidade você gostaria de ser atendido?'
);

-- ==================== STORES ====================
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  whatsapp TEXT,
  google_maps_url TEXT,
  business_hours JSONB DEFAULT '{"dom": {"open": "19:00", "close": "23:00", "enabled": true}, "qua": {"open": "19:00", "close": "23:00", "enabled": true}, "qui": {"open": "19:00", "close": "23:00", "enabled": true}, "sab": {"open": "19:00", "close": "23:00", "enabled": true}, "seg": {"open": null, "close": null, "enabled": false}, "sex": {"open": "19:00", "close": "23:00", "enabled": true}, "ter": {"open": "19:00", "close": "23:00", "enabled": true}}',
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== KNOWLEDGE_ITEMS ====================
CREATE TABLE public.knowledge_items (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'qa' CHECK (item_type IN ('qa', 'rule', 'info')),
  question TEXT,
  answer TEXT,
  rule_text TEXT,
  attached_buttons UUID[] DEFAULT '{}',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'general',
  image_url TEXT,
  file_url TEXT,
  file_name TEXT,
  buttons UUID[] DEFAULT '{}'
);

-- ==================== QUICK_ACTIONS ====================
CREATE TABLE public.quick_actions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '💡',
  label TEXT NOT NULL,
  message TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== CUSTOM_BUTTONS ====================
CREATE TABLE public.custom_buttons (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '🔗',
  label TEXT NOT NULL,
  color TEXT DEFAULT 'blue',
  action_type TEXT NOT NULL DEFAULT 'link' CHECK (action_type IN ('link', 'file')),
  link_url TEXT,
  file_name TEXT,
  file_url TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== CONVERSATIONS ====================
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  customer_identifier TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'waiting_human', 'closed')),
  channel TEXT DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp', 'instagram')),
  started_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  transferred_to_human BOOLEAN DEFAULT false,
  transferred_at TIMESTAMPTZ,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  customer_email TEXT,
  customer_notes TEXT,
  ai_enabled BOOLEAN DEFAULT true,
  verification_mode BOOLEAN DEFAULT false,
  verification_reason TEXT,
  verification_started_at TIMESTAMPTZ
);

-- ==================== MESSAGES ====================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  attached_buttons UUID[] DEFAULT '{}',
  tokens_used INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_human_response BOOLEAN DEFAULT false,
  image_url TEXT,
  file_url TEXT,
  file_name TEXT,
  possible_hallucination BOOLEAN DEFAULT false,
  hallucination_type TEXT,
  hallucination_details JSONB
);

-- ==================== ANALYTICS_DAILY ====================
CREATE TABLE public.analytics_daily (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  conversations_count INTEGER DEFAULT 0,
  messages_count INTEGER DEFAULT 0,
  unique_customers INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, date)
);

-- ==================== SPECIAL_HOURS ====================
CREATE TABLE public.special_hours (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  is_closed BOOLEAN DEFAULT false,
  open_time TIME,
  close_time TIME,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== SPECIAL_EVENTS ====================
CREATE TABLE public.special_events (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  action_button_text TEXT,
  action_button_url TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== API_KEYS ====================
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  key_value TEXT NOT NULL,
  provider VARCHAR DEFAULT 'grok',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  priority INTEGER DEFAULT 1,
  rate_limited_until TIMESTAMPTZ,
  requests_today INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  total_requests INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0
);

-- ==================== API_USAGE ====================
CREATE TABLE public.api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  endpoint VARCHAR,
  tokens_used INTEGER DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  status VARCHAR DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_input NUMERIC DEFAULT 0,
  cost_output NUMERIC DEFAULT 0,
  cost_total NUMERIC DEFAULT 0,
  model VARCHAR DEFAULT 'llama-3.3-70b-versatile',
  agent_name VARCHAR,
  client_name VARCHAR,
  request_type VARCHAR DEFAULT 'chat',
  response_time_ms INTEGER DEFAULT 0,
  blocked_by_security BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== SECURITY_PATTERNS ====================
CREATE TABLE public.security_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_name TEXT NOT NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('prompt_injection', 'manipulation', 'jailbreak', 'data_extraction', 'abuse', 'commercial_manipulation', 'spam')),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  pattern_regex TEXT,
  pattern_keywords TEXT[] DEFAULT '{}',
  pattern_text TEXT,
  similarity_threshold DOUBLE PRECISION DEFAULT 0.4,
  prepared_response TEXT NOT NULL,
  prepared_response_informal TEXT,
  should_log BOOLEAN DEFAULT true,
  should_block BOOLEAN DEFAULT true,
  should_transfer_human BOOLEAN DEFAULT false,
  description TEXT,
  examples TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  times_triggered INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== SECURITY_INCIDENTS ====================
CREATE TABLE public.security_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID REFERENCES public.security_patterns(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  original_message TEXT NOT NULL,
  detected_type TEXT,
  detection_method TEXT CHECK (detection_method IN ('regex', 'keyword', 'similarity')),
  similarity_score DOUBLE PRECISION,
  customer_identifier TEXT,
  action_taken TEXT DEFAULT 'blocked',
  response_sent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== UNANSWERED_QUESTIONS ====================
CREATE TABLE public.unanswered_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_identifier TEXT,
  question TEXT NOT NULL,
  agent_response TEXT,
  category TEXT DEFAULT 'unknown',
  is_resolved BOOLEAN DEFAULT false,
  resolved_answer TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_spam BOOLEAN DEFAULT false,
  spam_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== VERIFICATION_RESPONSES ====================
CREATE TABLE public.verification_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type TEXT NOT NULL,
  response_formal TEXT NOT NULL,
  response_informal TEXT NOT NULL,
  follow_up_formal TEXT,
  follow_up_informal TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== SYSTEM_SETTINGS ====================
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ==================== SUPPORT_MESSAGES ====================
CREATE TABLE public.support_messages (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  sender VARCHAR NOT NULL CHECK (sender IN ('user', 'admin')),
  user_email TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  read BOOLEAN DEFAULT false
);

-- ==================== TENANT_PERMISSIONS ====================
CREATE TABLE public.tenant_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  permission_value JSONB DEFAULT '{"enabled": true}',
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(user_id, permission_key)
);

-- ==================== TENANT_QUOTAS ====================
CREATE TABLE public.tenant_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  max_agents INTEGER DEFAULT 1,
  max_stores_per_agent INTEGER DEFAULT 5,
  max_knowledge_items INTEGER DEFAULT 100,
  max_custom_buttons INTEGER DEFAULT 10,
  max_tokens_per_month INTEGER DEFAULT 1000000,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Criar índices importantes
CREATE INDEX idx_conversations_agent_id ON public.conversations(agent_id);
CREATE INDEX idx_conversations_customer ON public.conversations(customer_identifier);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_knowledge_items_agent_id ON public.knowledge_items(agent_id);
CREATE INDEX idx_api_usage_agent_id ON public.api_usage(agent_id);
CREATE INDEX idx_api_usage_created_at ON public.api_usage(created_at);
CREATE INDEX idx_security_incidents_created_at ON public.security_incidents(created_at);

-- Índices de trigram para busca por similaridade
CREATE INDEX idx_knowledge_question_trgm ON public.knowledge_items USING gin (question gin_trgm_ops);
CREATE INDEX idx_knowledge_answer_trgm ON public.knowledge_items USING gin (answer gin_trgm_ops);
CREATE INDEX idx_security_pattern_text_trgm ON public.security_patterns USING gin (pattern_text gin_trgm_ops);

;
