ALTER TABLE public.webhook_dedup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only_webhook_dedup" ON public.webhook_dedup;
CREATE POLICY "service_role_only_webhook_dedup" ON public.webhook_dedup
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.conversation_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only_conversation_locks" ON public.conversation_locks;
CREATE POLICY "service_role_only_conversation_locks" ON public.conversation_locks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.lead_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only_lead_locks" ON public.lead_locks;
CREATE POLICY "service_role_only_lead_locks" ON public.lead_locks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.message_buffer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only_message_buffer" ON public.message_buffer;
CREATE POLICY "service_role_only_message_buffer" ON public.message_buffer
  FOR ALL TO service_role USING (true) WITH CHECK (true);
;
