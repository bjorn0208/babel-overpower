-- Cartela no Status "assim que vender" (Δ 2026-09-09, pedido do Theus).
-- O cron rodava de 30 em 30 min: o comprador reservava e o Status só refletia meia hora depois.
-- A edge já só posta quando a cartela MUDOU (compara com `rifas.vendidos_no_ultimo_status`),
-- então aumentar a frequência não vira spam — sem venda nova, ela sai sem postar nada.
-- 2 minutos é o mais perto de "na hora" sem transformar cada reserva em requisição extra.

select cron.unschedule('postar_status_rifas') where exists (
  select 1 from cron.job where jobname = 'postar_status_rifas'
);

select cron.schedule(
  'postar_status_rifas',
  '*/2 * * * *',
  $cron$
        SELECT net.http_post(
          url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-status-rifa',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
          ),
          body := '{}'::jsonb
        ) AS request_id;
  $cron$
);

comment on column public.rifas.vendidos_no_ultimo_status is
  'Total de números OCUPADOS (vendidos + reservados) no último post do Status. Δ 2026-09-09: antes contava só vendidos; reserva também muda a cartela e precisa disparar post novo.';
;
