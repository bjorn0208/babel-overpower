CREATE OR REPLACE FUNCTION public.fn_arquivar_leads_no_fim_campanha()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF ((OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('finished','finalizada'))
      OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)) THEN
    UPDATE public.leads_campanha SET archived_at = COALESCE(archived_at, now()) WHERE campaign_id = NEW.id AND archived_at IS NULL;
    UPDATE public.leads l SET location = CASE WHEN l.converted_at IS NOT NULL THEN 'cliente' ELSE 'base' END, updated_at = now()
    FROM public.leads_campanha cl WHERE cl.campaign_id = NEW.id AND cl.lead_id = l.id AND l.deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$

