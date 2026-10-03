select cron.unschedule('rifa_aviso_sorteio') where exists (select 1 from cron.job where jobname='rifa_aviso_sorteio');
select cron.schedule('rifa_aviso_sorteio', '*/5 * * * *', $$
        SELECT net.http_post(
          url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-aviso-sorteio-rifa',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
          ),
          body := '{}'::jsonb
        ) AS request_id;
        $$);
;
