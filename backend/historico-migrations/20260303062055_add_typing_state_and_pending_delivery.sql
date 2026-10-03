
-- typing_state: tracking de digitação do lead
CREATE TABLE IF NOT EXISTS typing_state (
  conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  is_typing BOOLEAN DEFAULT false,
  last_typing_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- pending_delivery: mensagens pendentes quando lead está digitando
CREATE TABLE IF NOT EXISTS pending_delivery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  mensagens TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pending_delivery_conv ON pending_delivery(conversation_id);

-- Cleanup cron jobs
SELECT cron.schedule('cleanup-typing-state', '*/10 * * * *',
  $$DELETE FROM public.typing_state WHERE updated_at < now() - interval '30 minutes'$$);

SELECT cron.schedule('cleanup-pending-delivery', '*/10 * * * *',
  $$DELETE FROM public.pending_delivery WHERE created_at < now() - interval '1 hour'$$);

-- RLS: service_role only (edge functions)
ALTER TABLE typing_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_delivery ENABLE ROW LEVEL SECURITY;

;
