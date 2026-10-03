
-- ============================================================
-- 017 SECURITY
-- ============================================================

CREATE TABLE security_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'input',
  detection_rules JSONB NOT NULL,
  action_on_match TEXT NOT NULL DEFAULT 'block',
  severity TEXT NOT NULL DEFAULT 'medium',
  response_message TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_security_patterns_updated_at
  BEFORE UPDATE ON security_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO security_patterns (name, category, direction, detection_rules, action_on_match, severity, response_message) VALUES
  ('Prompt Injection - Ignore Instructions', 'prompt_injection', 'input',
    '{"keywords": ["ignore previous", "ignore above", "disregard", "forget your instructions", "ignore suas instrucoes", "esqueca suas instrucoes", "ignore as instrucoes"], "case_sensitive": false}'::jsonb,
    'block', 'high', 'Desculpe, nao posso processar essa mensagem.'),
  ('Jailbreak - DAN Mode', 'jailbreak', 'input',
    '{"keywords": ["DAN mode", "jailbreak", "you are now", "act as if you have no restrictions", "pretend you are", "finja que voce e"], "case_sensitive": false}'::jsonb,
    'block', 'critical', 'Desculpe, nao posso processar essa mensagem.'),
  ('Prompt Injection - System Prompt Leak', 'prompt_injection', 'input',
    '{"keywords": ["show me your prompt", "reveal your instructions", "what are your rules", "mostre seu prompt", "revele suas instrucoes", "quais sao suas regras"], "case_sensitive": false}'::jsonb,
    'block', 'high', 'Desculpe, nao posso compartilhar essa informacao.'),
  ('Manipulation - Sensitive Data Request', 'manipulation', 'input',
    '{"keywords": ["password", "api key", "secret", "token", "credential", "senha", "chave de api"], "case_sensitive": false}'::jsonb,
    'flag', 'medium', NULL),
  ('Hallucination - Price Verification', 'hallucination', 'output',
    '{"check_type": "price_in_knowledge", "description": "Verifica se precos mencionados na resposta existem na knowledge base"}'::jsonb,
    'flag', 'high', NULL),
  ('Hallucination - Response Length vs Knowledge', 'hallucination', 'output',
    '{"check_type": "length_ratio", "max_ratio": 3.0, "description": "Resposta muito maior que o conhecimento disponivel indica fabricacao"}'::jsonb,
    'flag', 'medium', NULL);

-- SECURITY_INCIDENTS
CREATE TABLE security_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id UUID REFERENCES agents(id),
  lead_id UUID REFERENCES leads(id),
  conversation_id UUID REFERENCES conversations(id),
  message_id UUID REFERENCES messages(id),
  pattern_id UUID NOT NULL REFERENCES security_patterns(id),
  severity TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  original_content TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_incidents_tenant ON security_incidents (tenant_id);
CREATE INDEX idx_security_incidents_severity ON security_incidents (severity);
CREATE INDEX idx_security_incidents_created ON security_incidents (created_at);

ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incidents_select"
  ON security_incidents FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "incidents_insert"
  ON security_incidents FOR INSERT
  WITH CHECK (true);

CREATE POLICY "incidents_update"
  ON security_incidents FOR UPDATE
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('security.view'))
    OR is_platform_admin()
  );

-- FUNCAO: check_security
CREATE OR REPLACE FUNCTION check_security(
  _content TEXT,
  _direction TEXT DEFAULT 'input'
)
RETURNS TABLE (
  is_blocked BOOLEAN,
  pattern_id UUID,
  pattern_name TEXT,
  severity TEXT,
  action_on_match TEXT,
  response_message TEXT
) AS $$
DECLARE
  _pattern RECORD;
  _keywords TEXT[];
  _keyword TEXT;
BEGIN
  FOR _pattern IN
    SELECT sp.* FROM security_patterns sp
    WHERE sp.is_active = true
      AND sp.direction IN (_direction, 'both')
    ORDER BY
      CASE sp.severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END
  LOOP
    IF _pattern.detection_rules ? 'keywords' THEN
      _keywords := ARRAY(
        SELECT jsonb_array_elements_text(_pattern.detection_rules->'keywords')
      );

      FOREACH _keyword IN ARRAY _keywords LOOP
        IF lower(_content) LIKE '%' || lower(_keyword) || '%' THEN
          is_blocked := (_pattern.action_on_match = 'block');
          pattern_id := _pattern.id;
          pattern_name := _pattern.name;
          severity := _pattern.severity;
          action_on_match := _pattern.action_on_match;
          response_message := _pattern.response_message;
          RETURN NEXT;
          RETURN;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  is_blocked := false;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

;
