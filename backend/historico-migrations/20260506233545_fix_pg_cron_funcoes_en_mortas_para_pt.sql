-- 3 cron jobs apontavam pra funcoes EN que foram renomeadas no Big-Bang:
--   expire_subscriptions             -> expirar_assinaturas
--   promover_meta_chunks_estaveis    -> promover_meta_blocos_estaveis
--   recalculate_storage              -> recalcular_armazenamento
-- Sem este fix, 3 jobs falhavam silenciosamente todo dia/semana.

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  -- 1. expirar-assinaturas-meianoite (todo dia 00:00 UTC)
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'expirar-assinaturas-meianoite';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule('expirar-assinaturas-meianoite');
  END IF;
  PERFORM cron.schedule('expirar-assinaturas-meianoite', '0 0 * * *', 'SELECT public.expirar_assinaturas()');

  -- 2. cron-promover-blocos-meta (segunda 04:00 UTC)
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'cron-promover-blocos-meta';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule('cron-promover-blocos-meta');
  END IF;
  PERFORM cron.schedule('cron-promover-blocos-meta', '0 4 * * 1', 'SELECT public.promover_meta_blocos_estaveis(10, 7)');

  -- 3. reconciliar-armazenamento (domingo 04:00 UTC)
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'reconciliar-armazenamento';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule('reconciliar-armazenamento');
  END IF;
  PERFORM cron.schedule(
    'reconciliar-armazenamento',
    '0 4 * * 0',
    $cmd$SELECT public.recalcular_armazenamento(user_id) FROM public.assinaturas_usuario WHERE status = 'active'$cmd$
  );
END $$;
;
