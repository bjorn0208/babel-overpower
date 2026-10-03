CREATE OR REPLACE FUNCTION public.get_lead_tracking_status(_chave uuid)
 RETURNS TABLE(id uuid, fase_pipeline text, fase_cliente text, temperatura_lead text, pontuacao integer, is_hot boolean, precisa_humano boolean, client_checkpoints jsonb, tarefas_cliente jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    l.id,
    l.fase_pipeline,
    l.fase_cliente,
    l.temperatura_lead,
    l.pontuacao,
    l.is_hot,
    l.precisa_humano,
    l.client_checkpoints,
    l.tarefas_cliente,
    l.created_at,
    l.updated_at
  FROM public.leads l
  WHERE l.chave_rastreamento = _chave
    AND l.deleted_at IS NULL
  LIMIT 1;
$function$

