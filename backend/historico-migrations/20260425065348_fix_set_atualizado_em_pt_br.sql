
-- Cria função paralela pra colunas em pt-BR
CREATE OR REPLACE FUNCTION public.set_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

-- Reaponta os 4 triggers afetados (chunk_candidates, conversation_belief, episodic_memory, tag_candidates)
DROP TRIGGER IF EXISTS trg_set_updated_at_chunk_candidates ON public.chunk_candidates;
CREATE TRIGGER trg_set_atualizado_em_chunk_candidates
  BEFORE UPDATE ON public.chunk_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

DROP TRIGGER IF EXISTS trg_set_updated_at_conversation_belief ON public.conversation_belief;
CREATE TRIGGER trg_set_atualizado_em_conversation_belief
  BEFORE UPDATE ON public.conversation_belief
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

DROP TRIGGER IF EXISTS trg_set_updated_at_episodic_memory ON public.episodic_memory;
CREATE TRIGGER trg_set_atualizado_em_episodic_memory
  BEFORE UPDATE ON public.episodic_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

DROP TRIGGER IF EXISTS trg_set_updated_at_tag_candidates ON public.tag_candidates;
CREATE TRIGGER trg_set_atualizado_em_tag_candidates
  BEFORE UPDATE ON public.tag_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

;
