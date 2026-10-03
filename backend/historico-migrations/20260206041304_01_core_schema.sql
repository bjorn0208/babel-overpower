
-- ================================================================================
-- LIMPA NOME IA - SCHEMA CORE
-- ================================================================================

-- Extensoes
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================================
-- TABELA: profiles
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

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================================================
-- TABELA: agents
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
  gender TEXT DEFAULT 'feminino' CHECK (gender IN ('masculino', 'feminino', 'neutro')),
  business_segment TEXT DEFAULT 'financeiro',
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
-- TABELA: stores
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
    "seg": {"enabled": true, "shifts": [{"open": "09:00", "close": "18:00"}]},
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
-- TABELA: conversations
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
-- TABELA: messages
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
-- TABELA: knowledge_items
-- ================================================================================
CREATE TABLE IF NOT EXISTS knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN (
    'price', 'product', 'hours', 'location', 'contact',
    'reservation', 'delivery', 'payment', 'promotion', 'general',
    'debt', 'legal', 'process', 'faq', 'objection'
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
CREATE INDEX IF NOT EXISTS idx_knowledge_question_trgm ON knowledge_items USING gin (question extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_knowledge_answer_trgm ON knowledge_items USING gin (answer extensions.gin_trgm_ops);

;
