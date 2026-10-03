-- Migration: trigger_enqueue_embedding_knowledge
-- Adiciona knowledge_chunks ao CASE de enqueue_embedding_job
-- e cria 2 triggers de pipeline de embedding nessa tabela

-- 1. CREATE OR REPLACE da função adicionando o case knowledge_chunks
CREATE OR REPLACE FUNCTION public.enqueue_embedding_job()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  v_text text;
  v_new jsonb := to_jsonb(NEW);
BEGIN
  v_text := CASE TG_TABLE_NAME
    WHEN 'behavior_chunks'  THEN coalesce(v_new->>'situacao_descricao','') || E'\n' || coalesce(v_new->>'instrucao','')
    WHEN 'trigger_chunks'   THEN v_new->>'exemplo_frase'
    WHEN 'human_chunks'     THEN v_new->>'contexto_uso'
    WHEN 'lead_memory'      THEN v_new->>'fato'
    WHEN 'variation_chunks' THEN v_new->>'instrucao'
    WHEN 'knowledge_chunks' THEN coalesce(v_new->>'title','') || E'\n' || coalesce(v_new->>'content','')
    ELSE NULL
  END;

  IF v_text IS NULL OR length(trim(v_text)) = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM pgmq.send('embedding_jobs', jsonb_build_object(
    'table', TG_TABLE_NAME,
    'row_id', NEW.id,
    'text', v_text
  ));

  NEW.embedding_status := 'pending';
  RETURN NEW;
END;
$function$;

-- 2. Triggers em knowledge_chunks (DROP IF EXISTS para idempotência)
DROP TRIGGER IF EXISTS trg_enqueue_embedding_knowledge     ON public.knowledge_chunks;
DROP TRIGGER IF EXISTS trg_enqueue_embedding_knowledge_upd ON public.knowledge_chunks;

-- INSERT: enfileira embedding em todo novo chunk
CREATE TRIGGER trg_enqueue_embedding_knowledge
  BEFORE INSERT ON public.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

-- UPDATE: enfileira quando content mudar
CREATE TRIGGER trg_enqueue_embedding_knowledge_upd
  BEFORE UPDATE OF content ON public.knowledge_chunks
  FOR EACH ROW
  WHEN (OLD.content IS DISTINCT FROM NEW.content)
  EXECUTE FUNCTION public.enqueue_embedding_job();
;
