
-- ============================================================
-- 007 PLATFORM_CONFIGS + TENANT_CONFIGS
-- ============================================================

CREATE TABLE platform_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'text',
  description TEXT,
  is_tenant_overridable BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

INSERT INTO platform_configs (key, value, value_type, description, is_tenant_overridable) VALUES
  ('auth.session_timeout_minutes', '60', 'integer', 'Timeout de sessao em minutos', true),
  ('auth.max_login_attempts', '5', 'integer', 'Tentativas de login antes de bloqueio', false),
  ('invitation.expiry_hours', '72', 'integer', 'Horas ate o convite expirar', true),
  ('invitation.max_pending_per_tenant', '50', 'integer', 'Maximo de convites pendentes por tenant', true),
  ('chat.max_history_messages', '6', 'integer', 'Mensagens de historico enviadas ao LLM', true),
  ('chat.max_response_tokens', '500', 'integer', 'Tokens maximo na resposta do LLM', true),
  ('chat.default_temperature', '0.3', 'decimal', 'Temperatura padrao do LLM', true),
  ('credits.low_balance_threshold', '100', 'integer', 'Saldo minimo antes de aviso', true),
  ('credits.allow_negative', 'false', 'boolean', 'Permitir saldo negativo', false),
  ('security.max_incidents_per_hour', '10', 'integer', 'Incidentes por hora antes de bloquear lead', false),
  ('knowledge.max_items_per_agent', '500', 'integer', 'Maximo de items de knowledge por agente', true);

CREATE TABLE tenant_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'text',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id),
  UNIQUE (tenant_id, key)
);

CREATE INDEX idx_tenant_configs_tenant ON tenant_configs (tenant_id);

ALTER TABLE tenant_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_configs_select"
  ON tenant_configs FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "tenant_configs_manage"
  ON tenant_configs FOR ALL
  USING (is_platform_admin() OR (
    tenant_id = get_user_tenant_id()
    AND get_user_role() IN ('tenant_owner', 'team_admin')
  ));

CREATE OR REPLACE FUNCTION get_config(_key TEXT, _tenant_id UUID DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
  _value TEXT;
BEGIN
  IF _tenant_id IS NOT NULL THEN
    SELECT value INTO _value
    FROM tenant_configs
    WHERE tenant_id = _tenant_id AND key = _key;

    IF _value IS NOT NULL THEN
      RETURN _value;
    END IF;
  END IF;

  SELECT value INTO _value
  FROM platform_configs
  WHERE key = _key;

  RETURN _value;
END;
$$ LANGUAGE plpgsql STABLE;

;
