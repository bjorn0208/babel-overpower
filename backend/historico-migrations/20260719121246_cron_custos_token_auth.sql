-- Ajuste de auth do cron coletar-custos-llm: a vault `service_role_key` guarda
-- uma chave antiga (digest difere do env das edges), então a chamada via
-- Authorization tomava 401. Migrado pro padrão do cron-lembretes-financeiro:
-- header x-cron-token lido da vault `cron_custos_token` == env CRON_CUSTOS_TOKEN.
-- Down: reagendar com o bloco da migration 20260719120600.

SET lock_timeout = '4s';
SET statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'coletar-custos-llm') THEN
    PERFORM cron.unschedule('coletar-custos-llm');
  END IF;
END $$;

SELECT cron.schedule(
  'coletar-custos-llm',
  '0 1 * * *',
  $$
    SELECT net.http_post(
      url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-coletar-custos-llm',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-token', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'cron_custos_token'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb
    )
    WHERE EXISTS (
      SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_custos_token'
    );
  $$
);
;
