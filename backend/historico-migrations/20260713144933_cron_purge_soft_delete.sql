-- Cron mensal do purge (decisão D4): dia 1 às 04:00 UTC = 01:00 BRT.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purgar-soft-delete') THEN
    PERFORM cron.unschedule('purgar-soft-delete');
  END IF;
END;
$$;
SELECT cron.schedule('purgar-soft-delete', '0 4 1 * *',
  $$SELECT public.purgar_soft_delete_expirado()$$);
;
