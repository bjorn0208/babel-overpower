ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS zapi_message_id text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_messages_zapi_message_id ON public.messages(zapi_message_id) WHERE zapi_message_id IS NOT NULL;
;
