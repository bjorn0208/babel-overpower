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
$function$

