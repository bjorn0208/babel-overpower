CREATE OR REPLACE FUNCTION public.sync_conv_status_from_campaign_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead_id uuid;
  v_has_ativo boolean;
BEGIN
  v_lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
  IF v_lead_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.campaign_leads
    WHERE lead_id = v_lead_id AND state = 'ativo'
  ) INTO v_has_ativo;

  IF v_has_ativo THEN
    UPDATE public.conversations
    SET status = 'campaign', agent_enabled = false
    WHERE lead_id = v_lead_id
      AND status NOT IN ('campaign', 'closed');
  ELSE
    UPDATE public.conversations
    SET status = 'active', agent_enabled = true
    WHERE lead_id = v_lead_id
      AND status = 'campaign';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_leads_sync_conv ON public.campaign_leads;
CREATE TRIGGER trg_campaign_leads_sync_conv
AFTER INSERT OR UPDATE OF state OR DELETE ON public.campaign_leads
FOR EACH ROW EXECUTE FUNCTION public.sync_conv_status_from_campaign_lead();
;
