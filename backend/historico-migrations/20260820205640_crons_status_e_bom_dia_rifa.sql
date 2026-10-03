-- Crons do ciclo diário da rifa (horários em UTC; BRT = UTC-3) — 2026-08-20
select cron.unschedule('postar_status_rifas') where exists (select 1 from cron.job where jobname='postar_status_rifas');
select cron.schedule('postar_status_rifas', '*/30 * * * *', $$
        SELECT net.http_post(
          url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-status-rifa',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
          ),
          body := '{}'::jsonb
        ) AS request_id;
        $$);

select cron.unschedule('rifa_bom_dia_saudacao') where exists (select 1 from cron.job where jobname='rifa_bom_dia_saudacao');
select cron.schedule('rifa_bom_dia_saudacao', '0 10 * * *', $$
        SELECT net.http_post(
          url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-bom-dia-rifa',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
          ),
          body := '{"etapa":"saudacao"}'::jsonb
        ) AS request_id;
        $$);

select cron.unschedule('rifa_bom_dia_followup') where exists (select 1 from cron.job where jobname='rifa_bom_dia_followup');
select cron.schedule('rifa_bom_dia_followup', '0 15 * * *', $$
        SELECT net.http_post(
          url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-bom-dia-rifa',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
          ),
          body := '{"etapa":"followup"}'::jsonb
        ) AS request_id;
        $$);
;
