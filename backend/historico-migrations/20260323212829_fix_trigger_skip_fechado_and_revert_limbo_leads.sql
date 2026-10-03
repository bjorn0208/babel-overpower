
-- Fix 1: Trigger NÃO deve setar pipeline_stage='fechado' automaticamente.
-- Conversão lead→cliente é SEMPRE manual (botão no frontend).
CREATE OR REPLACE FUNCTION public.sync_pipeline_stage_from_lead_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead_id uuid;
  v_new_stage text;
BEGIN
  IF OLD.fase IS NOT DISTINCT FROM NEW.fase THEN
    RETURN NEW;
  END IF;

  SELECT lead_id INTO v_lead_id
  FROM public.conversations
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
    WHEN 'fechado' THEN v_new_stage := NULL; -- NÃO auto-converter; usuario decide manualmente
    ELSE v_new_stage := NULL;
  END CASE;

  IF v_new_stage IS NOT NULL THEN
    UPDATE public.leads
    SET pipeline_stage = v_new_stage
    WHERE id = v_lead_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix 3: Reverter leads em limbo (pipeline_stage='fechado' sem converted_at) para 'negociando'
UPDATE public.leads
SET pipeline_stage = 'negociando'
WHERE pipeline_stage = 'fechado'
  AND converted_at IS NULL;

;
