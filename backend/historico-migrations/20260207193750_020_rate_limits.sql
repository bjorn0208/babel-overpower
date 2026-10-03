
-- ============================================================
-- 020 RATE LIMITS
-- ============================================================

CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID UNIQUE NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_rate_limits_tenant ON rate_limits (tenant_id);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION check_rate_limit(
  _lead_id UUID,
  _max_per_minute INTEGER DEFAULT 10
)
RETURNS BOOLEAN AS $$
DECLARE
  _record RECORD;
  _tenant_id UUID;
BEGIN
  SELECT * INTO _record FROM rate_limits WHERE lead_id = _lead_id FOR UPDATE;

  IF _record IS NULL THEN
    SELECT tenant_id INTO _tenant_id FROM leads WHERE id = _lead_id;
    INSERT INTO rate_limits (tenant_id, lead_id)
    VALUES (_tenant_id, _lead_id);
    RETURN true;
  END IF;

  IF _record.window_start < now() - interval '1 minute' THEN
    UPDATE rate_limits
    SET window_start = now(), message_count = 1
    WHERE lead_id = _lead_id;
    RETURN true;
  END IF;

  IF _record.message_count >= _max_per_minute THEN
    RETURN false;
  END IF;

  UPDATE rate_limits
  SET message_count = message_count + 1
  WHERE lead_id = _lead_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql;

;
