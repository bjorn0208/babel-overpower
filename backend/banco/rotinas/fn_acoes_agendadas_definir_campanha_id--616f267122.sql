CREATE OR REPLACE FUNCTION public.fn_acoes_agendadas_definir_campanha_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.action_type LIKE 'campaign%' THEN
    BEGIN
      NEW.campaign_id := (NEW.carga->>'campaign_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NEW.campaign_id := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$

