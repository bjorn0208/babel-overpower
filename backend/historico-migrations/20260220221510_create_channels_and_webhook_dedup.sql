-- Channels: Z-API credentials per user (multi-tenant)
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'whatsapp',
  is_active boolean NOT NULL DEFAULT false,
  zapi_instance_id text NOT NULL DEFAULT '',
  zapi_token text NOT NULL DEFAULT '',
  zapi_security_token text NOT NULL DEFAULT '',
  -- humanization settings
  humanize_enabled boolean NOT NULL DEFAULT true,
  humanize_base_delay_ms integer NOT NULL DEFAULT 800,
  humanize_min_delay_ms integer NOT NULL DEFAULT 1500,
  humanize_max_delay_ms integer NOT NULL DEFAULT 8000,
  bubble_split_enabled boolean NOT NULL DEFAULT true,
  message_grouping_delay_ms integer NOT NULL DEFAULT 7000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, type)
);

-- Webhook dedup: prevent processing duplicate messages
CREATE TABLE IF NOT EXISTS webhook_dedup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  external_message_id text NOT NULL,
  message_text text,
  phone text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_dedup_channel_msg ON webhook_dedup(channel_id, external_message_id);
CREATE INDEX IF NOT EXISTS idx_webhook_dedup_channel_phone ON webhook_dedup(channel_id, phone, received_at);
CREATE INDEX IF NOT EXISTS idx_channels_instance ON channels(zapi_instance_id);

-- Add missing columns to leads for webhook integration
ALTER TABLE leads ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS profile_photo_url text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_channel text DEFAULT 'whatsapp';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS agent_id uuid;

-- RLS for channels
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_channels" ON channels FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin'));

CREATE POLICY "user_read_own_channel" ON channels FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id = (SELECT parent_user_id FROM profiles WHERE id = auth.uid()));

-- RLS for webhook_dedup (service role only, no user access needed)
ALTER TABLE webhook_dedup ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup old dedup entries (older than 24h)
CREATE OR REPLACE FUNCTION cleanup_old_dedup() RETURNS void AS $$
BEGIN
  DELETE FROM webhook_dedup WHERE received_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
;
