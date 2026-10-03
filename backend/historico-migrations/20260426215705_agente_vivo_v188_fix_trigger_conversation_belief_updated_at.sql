-- BUG CRÍTICO: trigger trg_set_atualizado_em_conversation_belief usava função genérica
-- set_atualizado_em() que faz NEW.atualizado_em := now(). Mas conversation_belief tem coluna
-- updated_at (em inglês) · trigger erra "record new has no field atualizado_em" toda UPDATE.
-- Resultado: UPSERTs do post-llm.ts falham silenciosamente · ficha do chat-test congelada.
--
-- Fix: trigger específico apontando pra função nova que seta NEW.updated_at.
-- Não mexe na função genérica `set_atualizado_em()` (outras tabelas dependem dela).

CREATE OR REPLACE FUNCTION public.set_updated_at_conversation_belief()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_atualizado_em_conversation_belief ON public.conversation_belief;

CREATE TRIGGER trg_set_updated_at_conversation_belief
  BEFORE UPDATE ON public.conversation_belief
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_conversation_belief();
;
