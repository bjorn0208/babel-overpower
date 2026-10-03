
-- FIX BUG CRÍTICO: episodic_memory trigger estava no padrão errado (pg_net direto)
-- Refaz no padrão das outras 7 RAGs (pgmq via enqueue_embedding_job)

DROP TRIGGER IF EXISTS trg_enqueue_embedding_episodic_after_insert ON public.episodic_memory;
DROP FUNCTION IF EXISTS public.trg_enqueue_embedding_episodic();

-- ALTER fn helper genérica pra incluir episodic_memory
CREATE OR REPLACE FUNCTION public.enqueue_embedding_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
    WHEN 'meta_chunks'      THEN v_new->>'corpo'
    WHEN 'episodic_memory'  THEN v_new->>'episodio_resumo'
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
$$;

-- Recria triggers no padrão correto (BEFORE INSERT + BEFORE UPDATE OF episodio_resumo)
CREATE TRIGGER trg_enqueue_embedding_episodic
  BEFORE INSERT ON public.episodic_memory
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

CREATE TRIGGER trg_enqueue_embedding_episodic_upd
  BEFORE UPDATE OF episodio_resumo ON public.episodic_memory
  FOR EACH ROW
  WHEN (OLD.episodio_resumo IS DISTINCT FROM NEW.episodio_resumo)
  EXECUTE FUNCTION public.enqueue_embedding_job();

;
