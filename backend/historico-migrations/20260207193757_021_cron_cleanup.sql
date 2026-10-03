
-- ============================================================
-- 021 CRON CLEANUP
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

GRANT USAGE ON SCHEMA cron TO postgres;

SELECT cron.schedule(
  'cleanup-webhook-dedup',
  '*/15 * * * *',
  $$DELETE FROM public.webhook_dedup WHERE received_at < now() - interval '1 hour'$$
);

SELECT cron.schedule(
  'cleanup-conversation-locks',
  '*/5 * * * *',
  $$DELETE FROM public.conversation_locks WHERE expires_at < now()$$
);

SELECT cron.schedule(
  'cleanup-rate-limits',
  '*/30 * * * *',
  $$DELETE FROM public.rate_limits WHERE window_start < now() - interval '10 minutes'$$
);

SELECT cron.schedule(
  'expire-invitations',
  '0 * * * *',
  $$UPDATE public.invitations SET status = 'expired' WHERE status = 'pending' AND expires_at < now()$$
);

;
