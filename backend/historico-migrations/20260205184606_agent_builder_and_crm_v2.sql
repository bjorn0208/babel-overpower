
-- ================================================================
-- AGENT BUILDER & CRM - Limpa Nome IA
-- ================================================================

-- Fluxos de agente (templates)
CREATE TABLE IF NOT EXISTS agent_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Novo Fluxo',
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  is_template BOOLEAN DEFAULT false,
  template_name TEXT,
  agent_name TEXT DEFAULT 'Assistente',
  agent_personality TEXT,
  greeting_message TEXT,
  fallback_message TEXT DEFAULT 'Desculpe, não entendi. Pode reformular?',
  use_rag BOOLEAN DEFAULT true,
  rag_threshold FLOAT DEFAULT 0.5,
  guardrails_enabled BOOLEAN DEFAULT true,
  blocked_topics TEXT[],
  required_validations TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_flows_tenant ON agent_flows(tenant_id);

-- Estados do fluxo
CREATE TABLE IF NOT EXISTS agent_flow_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES agent_flows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  state_key TEXT NOT NULL,
  state_type TEXT NOT NULL DEFAULT 'conversation',
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  system_prompt TEXT,
  user_instructions TEXT,
  data_to_capture JSONB DEFAULT '[]',
  advance_conditions JSONB DEFAULT '[]',
  pipeline_stage TEXT DEFAULT 'novo',
  max_retries INTEGER DEFAULT 2,
  retry_prompt TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(flow_id, state_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_flow_states_flow ON agent_flow_states(flow_id);

-- Transições entre estados
CREATE TABLE IF NOT EXISTS agent_flow_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES agent_flows(id) ON DELETE CASCADE,
  from_state_id UUID NOT NULL REFERENCES agent_flow_states(id) ON DELETE CASCADE,
  to_state_id UUID NOT NULL REFERENCES agent_flow_states(id) ON DELETE CASCADE,
  condition_type TEXT DEFAULT 'auto',
  condition_value JSONB DEFAULT '{}',
  priority INTEGER DEFAULT 0,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_flow_transitions_flow ON agent_flow_transitions(flow_id);

-- Base de conhecimento do agente
CREATE TABLE IF NOT EXISTS agent_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES agent_flows(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_flow ON agent_knowledge(flow_id);

-- Leads do CRM
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  cpf TEXT,
  pipeline_stage TEXT DEFAULT 'novo',
  current_state_key TEXT,
  lead_temperature TEXT DEFAULT 'warm',
  confirmed_name TEXT,
  confirmed_cpf TEXT,
  confirmed_email TEXT,
  confirmed_address TEXT,
  asked_about_price BOOLEAN DEFAULT false,
  asked_about_payment BOOLEAN DEFAULT false,
  expressed_interest BOOLEAN DEFAULT false,
  objections TEXT[],
  objections_resolved TEXT[],
  extracted_data JSONB DEFAULT '{}',
  total_messages INTEGER DEFAULT 0,
  user_messages INTEGER DEFAULT 0,
  agent_messages INTEGER DEFAULT 0,
  first_contact_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  needs_human_help BOOLEAN DEFAULT false,
  needs_human_help_reason TEXT,
  is_archived BOOLEAN DEFAULT false,
  profile_picture_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant ON crm_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_pipeline ON crm_leads(pipeline_stage);

-- Clientes (leads convertidos)
CREATE TABLE IF NOT EXISTS crm_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE RESTRICT,
  client_stage TEXT DEFAULT 'contrato',
  contract_value DECIMAL(12, 2),
  contract_date DATE,
  contract_signed BOOLEAN DEFAULT false,
  paid_amount DECIMAL(12, 2) DEFAULT 0,
  pending_amount DECIMAL(12, 2),
  tracking_token TEXT UNIQUE,
  expected_completion DATE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_clients_tenant ON crm_clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_clients_lead ON crm_clients(lead_id);

-- Sessões do agente
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES agent_flows(id) ON DELETE SET NULL,
  current_state_key TEXT NOT NULL DEFAULT 'START',
  previous_state_key TEXT,
  extracted_data JSONB DEFAULT '{}',
  state_history JSONB DEFAULT '[]',
  flags JSONB DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_tenant ON agent_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_conversation ON agent_sessions(conversation_id);

-- RLS
ALTER TABLE agent_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_flow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_flow_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "full_access_agent_flows" ON agent_flows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_agent_flow_states" ON agent_flow_states FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_agent_flow_transitions" ON agent_flow_transitions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_agent_knowledge" ON agent_knowledge FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_crm_leads" ON crm_leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_crm_clients" ON crm_clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_agent_sessions" ON agent_sessions FOR ALL USING (true) WITH CHECK (true);

;
