
-- ============================================================
-- 011 FLOWS + BLOCKS + BLOCK_TYPE_DEFINITIONS
-- ============================================================

CREATE TABLE flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL,
  is_entry_point BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_flows_agent_position ON flows (agent_id, position);
CREATE UNIQUE INDEX idx_flows_agent_name ON flows (agent_id, name);
CREATE INDEX idx_flows_tenant ON flows (tenant_id);

CREATE TRIGGER trg_flows_updated_at
  BEFORE UPDATE ON flows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flows_select"
  ON flows FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "flows_manage"
  ON flows FOR ALL
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('flows.edit'))
    OR is_platform_admin()
  );

-- BLOCK_TYPE_DEFINITIONS
CREATE TABLE block_type_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_slug TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  config_schema JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_latest BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type_slug, version)
);

INSERT INTO block_type_definitions (type_slug, name, description, config_schema) VALUES
  ('prompt', 'Prompt', 'Envia mensagem fixa ao lead', '{"type":"object","properties":{"message":{"type":"string","description":"Mensagem a enviar"},"delay_ms":{"type":"integer","description":"Delay antes de enviar (humanizacao)","default":1000}},"required":["message"]}'::jsonb),
  ('capture', 'Captura', 'Coleta dado do lead com validacao', '{"type":"object","properties":{"capture_type_id":{"type":"string","description":"FK capture_type_definitions"},"prompt_message":{"type":"string","description":"Mensagem pedindo o dado"},"max_attempts":{"type":"integer","default":3},"on_fail_message":{"type":"string","description":"Mensagem apos max tentativas"}},"required":["capture_type_id","prompt_message"]}'::jsonb),
  ('confirmation', 'Confirmacao', 'Confirma dado capturado com o lead', '{"type":"object","properties":{"template":{"type":"string","description":"Template com {value}"},"yes_keywords":{"type":"array","items":{"type":"string"},"default":["sim","isso","correto"]},"no_keywords":{"type":"array","items":{"type":"string"},"default":["nao","errado","incorreto"]}},"required":["template"]}'::jsonb),
  ('condition', 'Condicao', 'Decide caminho com base em regra', '{"type":"object","properties":{"field":{"type":"string","description":"Campo a avaliar"},"operator":{"type":"string","enum":["equals","not_equals","contains","greater_than","less_than","is_set","is_not_set"]},"value":{"type":"string"},"true_block_id":{"type":"string"},"false_block_id":{"type":"string"}},"required":["field","operator"]}'::jsonb),
  ('action', 'Acao', 'Executa acao do sistema', '{"type":"object","properties":{"action_type":{"type":"string","enum":["create_lead","update_lead_status","send_notification","call_webhook","transfer_to_human","assign_tag"]},"params":{"type":"object"}},"required":["action_type"]}'::jsonb),
  ('ai_free', 'IA Livre', 'Resposta livre usando LLM + knowledge base', '{"type":"object","properties":{"context_prompt":{"type":"string","description":"Instrucao adicional pro LLM"},"max_turns":{"type":"integer","default":10},"advance_keywords":{"type":"array","items":{"type":"string"}},"use_knowledge":{"type":"boolean","default":true}}}'::jsonb),
  ('transition', 'Transicao', 'Move lead para outro fluxo', '{"type":"object","properties":{"target_flow_id":{"type":"string"},"target_block_position":{"type":"integer","default":1},"preserve_fields":{"type":"boolean","default":true}},"required":["target_flow_id"]}'::jsonb);

-- BLOCKS
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  block_type_definition_id UUID NOT NULL REFERENCES block_type_definitions(id),
  position INTEGER NOT NULL,
  label TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_blocks_flow_position ON blocks (flow_id, position);
CREATE INDEX idx_blocks_tenant ON blocks (tenant_id);
CREATE INDEX idx_blocks_flow ON blocks (flow_id);

CREATE TRIGGER trg_blocks_updated_at
  BEFORE UPDATE ON blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocks_select"
  ON blocks FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "blocks_manage"
  ON blocks FOR ALL
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('flows.edit'))
    OR is_platform_admin()
  );

;
