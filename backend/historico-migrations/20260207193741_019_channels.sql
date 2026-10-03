
-- ============================================================
-- 019 CHANNELS
-- ============================================================

CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  type TEXT NOT NULL DEFAULT 'webchat',
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  zapi_instance_id TEXT,
  zapi_token TEXT,
  zapi_security_token TEXT,
  humanize_enabled BOOLEAN NOT NULL DEFAULT true,
  humanize_min_delay_ms INTEGER NOT NULL DEFAULT 1500,
  humanize_max_delay_ms INTEGER NOT NULL DEFAULT 8000,
  humanize_base_delay_ms INTEGER NOT NULL DEFAULT 800,
  bubble_split_enabled BOOLEAN NOT NULL DEFAULT true,
  message_grouping_delay_ms INTEGER NOT NULL DEFAULT 7000,
  webhook_url TEXT,
  webhook_secret TEXT DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE UNIQUE INDEX idx_channels_agent_type ON channels (agent_id, type);
CREATE INDEX idx_channels_tenant ON channels (tenant_id);
CREATE INDEX idx_channels_active ON channels (is_active) WHERE is_active = true;

CREATE TRIGGER trg_channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channels_select"
  ON channels FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "channels_manage"
  ON channels FOR ALL
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('agents.edit'))
    OR is_platform_admin()
  );

-- WEBHOOK_DEDUP
CREATE TABLE webhook_dedup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  external_message_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, external_message_id)
);

CREATE INDEX idx_webhook_dedup_received ON webhook_dedup (received_at);

CREATE OR REPLACE FUNCTION cleanup_webhook_dedup()
RETURNS void AS $$
  DELETE FROM webhook_dedup WHERE received_at < now() - interval '1 hour';
$$ LANGUAGE sql;

-- CONVERSATION_LOCKS
CREATE TABLE conversation_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  locked_by TEXT NOT NULL DEFAULT 'edge_function',
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 seconds'),
  UNIQUE (conversation_id)
);

CREATE OR REPLACE FUNCTION acquire_conversation_lock(
  _conversation_id UUID,
  _locked_by TEXT DEFAULT 'edge_function'
)
RETURNS BOOLEAN AS $$
DECLARE
  _acquired BOOLEAN;
BEGIN
  DELETE FROM conversation_locks WHERE expires_at < now();

  INSERT INTO conversation_locks (conversation_id, locked_by)
  VALUES (_conversation_id, _locked_by)
  ON CONFLICT (conversation_id) DO NOTHING;

  GET DIAGNOSTICS _acquired = ROW_COUNT;
  RETURN _acquired > 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION release_conversation_lock(_conversation_id UUID)
RETURNS void AS $$
  DELETE FROM conversation_locks WHERE conversation_id = _conversation_id;
$$ LANGUAGE sql;

;
