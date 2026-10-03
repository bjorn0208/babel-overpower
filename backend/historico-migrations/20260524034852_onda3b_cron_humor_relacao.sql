-- Onda 3B — agenda o recomputo do humor da relação no SONO.
-- 05h UTC (02h BRT), depois do cron-decay-episodios (03h UTC) → lê decay_factor fresco,
-- e antes do destilar-memoria (06h UTC). Idempotente.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-humor-relacao') THEN
    PERFORM cron.unschedule('cron-humor-relacao');
  END IF;
END $$;

SELECT cron.schedule('cron-humor-relacao', '0 5 * * *', $$SELECT public.recomputar_humor_relacao();$$);
;
