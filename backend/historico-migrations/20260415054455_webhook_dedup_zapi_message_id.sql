ALTER TABLE public.webhook_dedup
  ADD COLUMN IF NOT EXISTS zapi_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_dedup_zapi_message_id_uniq
  ON public.webhook_dedup (zapi_message_id)
  WHERE zapi_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS webhook_dedup_received_at_idx
  ON public.webhook_dedup (received_at DESC);
;
