CREATE OR REPLACE FUNCTION public.trg_atualizar_ultima_resposta_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_lead_id uuid;
BEGIN
  IF NEW.role <> 'user' THEN
    RETURN NEW;
  END IF;

  SELECT lead_id INTO v_lead_id FROM public.conversas WHERE id = NEW.conversation_id;

  IF v_lead_id IS NOT NULL THEN
    UPDATE public.leads
    SET ultima_resposta_lead_em = NEW.created_at
    WHERE id = v_lead_id;
  END IF;

  RETURN NEW;
END;
$function$

