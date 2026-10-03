
-- ================================================================================
-- LIMPA NOME IA - TABELAS CRM (Funil de Vendas)
-- ================================================================================

-- leads (Pipeline de vendas)
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

  -- Dados pessoais
  name TEXT,
  phone TEXT,
  email TEXT,
  cpf TEXT,
  address TEXT,

  -- Pipeline
  stage TEXT DEFAULT 'novo' CHECK (stage IN ('novo', 'qualificando', 'negociando', 'fechado', 'perdido')),
  temperature TEXT DEFAULT 'warm' CHECK (temperature IN ('hot', 'warm', 'cold')),

  -- Dados financeiros (Limpa Nome)
  debt_value DECIMAL(12,2),
  debt_organs TEXT[] DEFAULT '{}',
  client_type TEXT CHECK (client_type IN ('nome_sujo', 'nome_limpo', 'nao_sabe')),

  -- Estado do agente IA
  agent_state TEXT DEFAULT 'GREETING',
  objection_count INTEGER DEFAULT 0,
  last_objection_type TEXT,

  -- Controle
  source TEXT DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'web', 'instagram', 'telegram', 'manual', 'api')),
  assigned_to UUID REFERENCES profiles(id),
  tags TEXT[] DEFAULT '{}',
  notes TEXT,

  -- Flags
  is_qualified BOOLEAN DEFAULT false,
  is_converted BOOLEAN DEFAULT false,
  lost_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_agent ON leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads(temperature);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_cpf ON leads(cpf);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

-- clients (Leads convertidos)
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Dados pessoais
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  cpf TEXT,
  rg TEXT,
  address TEXT,

  -- Status do servico
  service_type TEXT DEFAULT 'limpa_nome' CHECK (service_type IN ('limpa_nome', 'diagnostico', 'consultoria')),
  status TEXT DEFAULT 'contrato' CHECK (status IN ('contrato', 'documentacao', 'protocolando', 'andamento', 'concluido', 'cancelado')),

  -- Financeiro
  contract_value DECIMAL(12,2),
  total_paid DECIMAL(12,2) DEFAULT 0,
  installments_paid INTEGER DEFAULT 0,
  installments_total INTEGER DEFAULT 0,

  -- Documentos recebidos
  documents_received JSONB DEFAULT '[]',

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_agent ON clients(agent_id);
CREATE INDEX IF NOT EXISTS idx_clients_lead ON clients(lead_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_cpf ON clients(cpf);

-- contracts (Contratos digitais)
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- Tipo e status
  contract_type TEXT DEFAULT 'limpa_nome' CHECK (contract_type IN ('limpa_nome', 'diagnostico', 'consultoria')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'active', 'completed', 'canceled')),

  -- Valores
  total_value DECIMAL(12,2),
  entry_fee DECIMAL(12,2),
  installment_value DECIMAL(12,2),
  installment_count INTEGER DEFAULT 0,

  -- Assinatura digital
  external_id TEXT,
  signature_url TEXT,
  signed_at TIMESTAMPTZ,

  -- PDF
  document_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_agent ON contracts(agent_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- payments (Pagamentos)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,

  -- Tipo
  payment_type TEXT DEFAULT 'entry' CHECK (payment_type IN ('entry', 'installment', 'diagnostic', 'full')),
  installment_number INTEGER,

  -- Valores
  amount DECIMAL(12,2) NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'overdue', 'refunded', 'canceled')),
  method TEXT CHECK (method IN ('pix', 'boleto', 'credit_card', 'debit_card')),

  -- Gateway (Asaas)
  external_id TEXT,
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  boleto_url TEXT,
  
  paid_at TIMESTAMPTZ,
  due_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- tasks (Tarefas do CRM)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id),

  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'follow_up' CHECK (task_type IN ('follow_up', 'document_collection', 'payment_reminder', 'contract', 'callback', 'other')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'canceled')),

  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

-- activities (Log de atividades)
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),

  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'call', 'email', 'whatsapp', 'meeting', 'note',
    'stage_change', 'temperature_change', 'task_created',
    'contract_sent', 'contract_signed', 'payment_received',
    'document_received', 'status_change'
  )),

  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_agent ON activities(agent_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_client ON activities(client_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);

-- documents (Documentos recebidos)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  doc_type TEXT NOT NULL CHECK (doc_type IN ('cpf', 'rg', 'cnh', 'comprovante_residencia', 'comprovante_renda', 'contrato_assinado', 'outro')),
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,

  status TEXT DEFAULT 'received' CHECK (status IN ('received', 'approved', 'rejected')),
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type);

-- Realtime para CRM
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

;
