CREATE OR REPLACE FUNCTION public.marcar_lead_recusado(p_lead_id uuid, p_motivo text DEFAULT NULL::text)
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
$function$

