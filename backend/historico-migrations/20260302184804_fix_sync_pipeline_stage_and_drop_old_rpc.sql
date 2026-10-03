
-- Bug 1: Trigger para sincronizar leads.pipeline_stage quando lead_cards.fase muda
CREATE OR REPLACE FUNCTION public.sync_pipeline_stage_from_lead_card()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead_id uuid;
  v_new_stage text;
BEGIN
  -- Só executa se fase realmente mudou
  IF OLD.fase IS NOT DISTINCT FROM NEW.fase THEN
    RETURN NEW;
  END IF;

  -- Buscar o lead_id da conversa
  SELECT lead_id INTO v_lead_id
  FROM public.conversations
  WHERE id = NEW.conversation_id
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mapear fase do chat → pipeline_stage do lead
  CASE NEW.fase
    WHEN 'saudacao' THEN v_new_stage := 'novo';
    WHEN 'qualificacao' THEN v_new_stage := 'qualificando';
    WHEN 'apresentacao' THEN v_new_stage := 'apresentando';
    WHEN 'negociacao' THEN v_new_stage := 'negociando';
    WHEN 'fechado' THEN v_new_stage := 'fechado';
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

-- Criar trigger
DROP TRIGGER IF EXISTS trg_sync_pipeline_stage ON public.lead_cards;
CREATE TRIGGER trg_sync_pipeline_stage
  AFTER UPDATE OF fase ON public.lead_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_pipeline_stage_from_lead_card();

-- Corrigir pipeline_stage de todos os leads ativos baseado em lead_cards.fase atual
UPDATE public.leads l
SET pipeline_stage = CASE lc.fase
  WHEN 'saudacao' THEN 'novo'
  WHEN 'qualificacao' THEN 'qualificando'
  WHEN 'apresentacao' THEN 'apresentando'
  WHEN 'negociacao' THEN 'negociando'
  WHEN 'fechado' THEN 'fechado'
  ELSE l.pipeline_stage
END
FROM public.conversations c
JOIN public.lead_cards lc ON lc.conversation_id = c.id
WHERE c.lead_id = l.id
  AND l.pipeline_stage NOT IN ('fechado', 'arquivado');

-- Bug 2: Dropar versão antiga do RPC (uuid parameter, lê client_service_flows inexistente)
DROP FUNCTION IF EXISTS public.get_public_service_flow(uuid);

-- Bug 1 extra: Remover a linha morta no index.ts que tenta lead_cards.pipeline_stage
-- (feito no código, não no SQL)

;
