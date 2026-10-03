-- Migration: set_updated_at_rag_tables
-- Cria função genérica set_updated_at() e triggers nas 5 tabelas RAG

-- 1. Adicionar updated_at em knowledge_chunks (única tabela RAG que não tem)
ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Função genérica set_updated_at (SECURITY DEFINER + search_path fixo)
CREATE OR REPLACE FUNCTION public.set_updated_at()
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

-- 3. Triggers nas 5 tabelas RAG (DROP IF EXISTS para idempotência)
DROP TRIGGER IF EXISTS trg_set_updated_at_knowledge  ON public.knowledge_chunks;
DROP TRIGGER IF EXISTS trg_set_updated_at_behavior   ON public.behavior_chunks;
DROP TRIGGER IF EXISTS trg_set_updated_at_trigger    ON public.trigger_chunks;
DROP TRIGGER IF EXISTS trg_set_updated_at_human      ON public.human_chunks;
DROP TRIGGER IF EXISTS trg_set_updated_at_variation  ON public.variation_chunks;

CREATE TRIGGER trg_set_updated_at_knowledge
  BEFORE UPDATE ON public.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_behavior
  BEFORE UPDATE ON public.behavior_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_trigger
  BEFORE UPDATE ON public.trigger_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_human
  BEFORE UPDATE ON public.human_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_variation
  BEFORE UPDATE ON public.variation_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
;
