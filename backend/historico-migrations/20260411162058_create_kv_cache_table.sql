
SET search_path = public, auth;

CREATE TABLE IF NOT EXISTS kv_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE kv_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "srv_kv_cache" ON kv_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_kv_cache_key ON kv_cache (key);

;
