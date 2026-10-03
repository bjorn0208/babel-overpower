-- Onda 0 (plano consolidação biblioteca de dados v1.1):
-- 1. marcar_leads_sumidos media o lado ERRADO: role='human' = lado da empresa
--    (eco do agente + humano). Atividade do LEAD é role='user'.
CREATE OR REPLACE FUNCTION public.marcar_leads_sumidos(p_dias_sem_resposta integer DEFAULT 7)
 RETURNS TABLE(marcados integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      -- última mensagem do LEAD (role='user') nessa conversa > X dias atrás
      AND NOT EXISTS (
        SELECT 1 FROM public.mensagens m
        JOIN public.conversas c ON c.id = m.conversation_id
        WHERE c.lead_id = l.id
          AND m.role = 'user'
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
$function$;

-- 2. Caminho de gravar desfecho='recusado' com motivo (app/CommandBar).
--    Convertido nunca é sobrescrito.
CREATE OR REPLACE FUNCTION public.marcar_lead_recusado(p_lead_id uuid, p_motivo text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'sem permissão para este lead';
  END IF;

  UPDATE public.leads
  SET desfecho = 'recusado',
      desfecho_em = now(),
      desfecho_motivo = COALESCE(NULLIF(trim(p_motivo), ''), 'recusado (manual)')
  WHERE id = p_lead_id
    AND deleted_at IS NULL
    AND desfecho IS DISTINCT FROM 'convertido';

  RETURN FOUND;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.marcar_lead_recusado(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_lead_recusado(uuid, text) TO authenticated;
;
