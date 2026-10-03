CREATE INDEX IF NOT EXISTS idx_conversations_tenant_updated_desc
  ON public.conversations (tenant_id, updated_at DESC);
;
