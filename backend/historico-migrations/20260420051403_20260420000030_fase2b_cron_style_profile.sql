
-- Fase 2B — Decisão 10: cron 1x/h que calcula style_profile dos leads ativos
-- UTC sempre (BRT = UTC-3). '0 * * * *' = topo de cada hora UTC.
-- Idempotente: unschedule antes de schedule.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'calcular_style_profile_hourly';

SELECT cron.schedule(
  'calcular_style_profile_hourly',
  '0 * * * *',
  $cron$
    DO $body$
    DECLARE
      v_lead_id uuid;
    BEGIN
      -- Calcula style_profile para leads ativos sem perfil
      -- ou com mensagens novas nas últimas 24h
      FOR v_lead_id IN
        SELECT DISTINCT cl.lead_id
        FROM public.campaign_leads cl
        WHERE cl.state = 'ativo'
          AND (
            cl.style_profile IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.messages m
              JOIN public.conversations c ON c.id = m.conversation_id
              WHERE c.lead_id  = cl.lead_id
                AND m.role     = 'user'
                AND m.deleted_at IS NULL
                AND m.created_at > now() - interval '24 hours'
            )
          )
      LOOP
        PERFORM public.calcular_style_profile(v_lead_id);
      END LOOP;
    END;
    $body$;
  $cron$
);

;
