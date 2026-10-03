
-- Add columns for message grouping buffer
ALTER TABLE webhook_dedup 
  ADD COLUMN IF NOT EXISTS message_text text,
  ADD COLUMN IF NOT EXISTS phone text;

-- Index for efficient grouping queries
CREATE INDEX IF NOT EXISTS idx_webhook_dedup_grouping 
  ON webhook_dedup (channel_id, phone, received_at DESC)
  WHERE phone IS NOT NULL;

;
