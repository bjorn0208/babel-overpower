DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-llm-request-logs') THEN
    PERFORM cron.schedule(
      'cleanup-llm-request-logs',
      '10 3 * * *',
      $sql$DELETE FROM public.llm_request_logs WHERE created_at < now() - interval '30 days'$sql$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-api-usage-logs') THEN
    PERFORM cron.schedule(
      'cleanup-api-usage-logs',
      '20 3 * * *',
      $sql$DELETE FROM public.api_usage_logs WHERE created_at < now() - interval '30 days'$sql$
    );
  END IF;
END
$do$;
;
