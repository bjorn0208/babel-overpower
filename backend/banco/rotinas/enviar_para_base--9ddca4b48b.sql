CREATE OR REPLACE FUNCTION public.enviar_para_base(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.leads SET location = 'base', updated_at = now() WHERE id = p_lead_id AND deleted_at IS NULL;
  UPDATE public.conversas SET status = 'encerrada', agent_enabled = false, updated_at = now() WHERE lead_id = p_lead_id;
END;
$function$

