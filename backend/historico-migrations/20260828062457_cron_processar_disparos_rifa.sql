SELECT cron.schedule(
  'processar_disparos_rifa',
  '*/5 * * * *',
  $$
        SELECT net.http_post(
          url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/processar-disparos-rifa',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
          ),
          body := '{}'::jsonb
        ) AS request_id;
        $$
);
;
