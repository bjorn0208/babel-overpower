CREATE OR REPLACE FUNCTION public.sincronizar_fase_pipeline_de_ficha_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_lead_id uuid;
  v_new_stage text;
BEGIN
  IF OLD.fase IS NOT DISTINCT FROM NEW.fase THEN
    RETURN NEW;
  END IF;

  SELECT lead_id INTO v_lead_id
  FROM public.conversas
  WHERE id = NEW.conversation_id
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  CASE NEW.fase
    WHEN 'saudacao' THEN v_new_stage := 'novo';
    WHEN 'qualificacao' THEN v_new_stage := 'qualificando';
    WHEN 'apresentacao' THEN v_new_stage := 'apresentando';
    WHEN 'negociacao' THEN v_new_stage := 'negociando';
    WHEN 'fechado' THEN v_new_stage := NULL;
    ELSE v_new_stage := NULL;
  END CASE;

  IF v_new_stage IS NOT NULL THEN
    UPDATE public.leads
    SET fase_pipeline = v_new_stage
    WHERE id = v_lead_id;
  END IF;

  RETURN NEW;
END;
$function$

