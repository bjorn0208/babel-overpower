-- Trilho B1 do fosso — desfecho do lead (closed/sumido/convertido)
-- Permite cross_nicho aprender "qual padrão de conversa converte vs perde"
-- e popular AbaDashboard com taxa de conversão real.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS desfecho text
    CHECK (desfecho IN ('convertido','recusado','sumido','desqualificado','outro')),
  ADD COLUMN IF NOT EXISTS desfecho_em timestamptz,
  ADD COLUMN IF NOT EXISTS desfecho_motivo text;

CREATE INDEX IF NOT EXISTS leads_desfecho_idx
  ON public.leads (desfecho)
  WHERE deleted_at IS NULL AND desfecho IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_desfecho_tenant_em_idx
  ON public.leads (tenant_id, desfecho_em DESC)
  WHERE deleted_at IS NULL AND desfecho IS NOT NULL;

COMMENT ON COLUMN public.leads.desfecho IS
  'Trilho B1 — fechamento de ciclo do lead. NULL = ainda ativo. convertido = virou cliente. sumido = >7d sem responder. recusado = explicitamente não quer. desqualificado = fora do ICP.';

COMMENT ON COLUMN public.leads.desfecho_em IS 'Quando o desfecho foi cravado (manual ou via cron-leads-sumidos).';
COMMENT ON COLUMN public.leads.desfecho_motivo IS 'Texto curto livre do motivo. Cron-leads-sumidos preenche "sem resposta há Xd".';

-- Função: marca leads como sumidos quando passa do threshold sem interação
CREATE OR REPLACE FUNCTION public.marcar_leads_sumidos(p_dias_sem_resposta int DEFAULT 7)
RETURNS TABLE(marcados int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_marcados int;
BEGIN
  WITH atualizados AS (
    UPDATE public.leads l
    SET desfecho = 'sumido',
        desfecho_em = now(),
        desfecho_motivo = 'sem resposta há ' || p_dias_sem_resposta || 'd (cron)'
    WHERE l.desfecho IS NULL
      AND l.deleted_at IS NULL
      -- última mensagem do lead nessa conversa > X dias atrás
      AND NOT EXISTS (
        SELECT 1 FROM public.mensagens m
        JOIN public.conversas c ON c.id = m.conversation_id
        WHERE c.lead_id = l.id
          AND m.role = 'human'
          AND m.created_at > (now() - (p_dias_sem_resposta || ' days')::interval)
      )
      -- e existe pelo menos 1 conversa antiga (lead conversou em algum momento)
      AND EXISTS (
        SELECT 1 FROM public.conversas c WHERE c.lead_id = l.id
      )
    RETURNING l.id
  )
  SELECT count(*)::int INTO v_marcados FROM atualizados;

  RETURN QUERY SELECT v_marcados;
END;
$$;

COMMENT ON FUNCTION public.marcar_leads_sumidos IS
  'Trilho B1 — cron-leads-sumidos. Marca como sumido leads sem mensagem humana há N dias. Default 7d.';

REVOKE EXECUTE ON FUNCTION public.marcar_leads_sumidos(int) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_leads_sumidos(int) TO service_role;

-- Cron: roda 1x por dia às 03:00 UTC (00:00 BRT)
SELECT cron.unschedule('cron-leads-sumidos') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cron-leads-sumidos'
);

SELECT cron.schedule(
  'cron-leads-sumidos',
  '0 3 * * *',
  $$SELECT public.marcar_leads_sumidos(7);$$
);
;
