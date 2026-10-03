-- Helper RPC pra gerar-embedding archive batch.
CREATE OR REPLACE FUNCTION public.pgmq_archive_batch(p_queue text, p_msg_ids bigint[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pgmq
AS $$
BEGIN
  PERFORM pgmq.archive(p_queue, m_id) FROM unnest(p_msg_ids) AS m_id;
END;
$$;

-- Idempotente
SELECT cron.unschedule('process_embedding_jobs')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process_embedding_jobs');

SELECT cron.schedule(
  'process_embedding_jobs',
  '*/1 * * * *',  -- a cada minuto
  $CRON$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'EMBED_FUNCTION_URL'),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := (
        SELECT coalesce(jsonb_agg(jsonb_build_object('msg_id', msg_id, 'message', message)), '[]'::jsonb)
        FROM (SELECT msg_id, message FROM pgmq.read('embedding_jobs', 30, 30)) AS msg
      )
    )
    WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'EMBED_FUNCTION_URL');
  $CRON$
);
;
