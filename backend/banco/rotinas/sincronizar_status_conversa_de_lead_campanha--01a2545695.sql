CREATE OR REPLACE FUNCTION public.sincronizar_status_conversa_de_lead_campanha()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_lead_id uuid; v_has_ativo boolean;
BEGIN
  v_lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
  IF v_lead_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT EXISTS (SELECT 1 FROM public.leads_campanha WHERE lead_id = v_lead_id AND state = 'ativo') INTO v_has_ativo;
  IF v_has_ativo THEN
    UPDATE public.conversas SET status = 'campaign', agent_enabled = false
    WHERE lead_id = v_lead_id AND status NOT IN ('campaign','closed','encerrada');
  ELSE
    UPDATE public.conversas SET status = 'ativa', agent_enabled = true
    WHERE lead_id = v_lead_id AND status = 'campaign';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$

