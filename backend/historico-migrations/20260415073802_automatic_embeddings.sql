CREATE EXTENSION IF NOT EXISTS pgmq;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'embedding_jobs') THEN
    PERFORM pgmq.create('embedding_jobs');
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.enqueue_embedding_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text text;
BEGIN
  v_text := CASE TG_TABLE_NAME
    WHEN 'behavior_chunks' THEN NEW.situacao_descricao || E'\n' || NEW.instrucao
    WHEN 'trigger_chunks' THEN NEW.exemplo_frase
    WHEN 'human_chunks' THEN NEW.contexto_uso
    WHEN 'lead_memory' THEN NEW.fato
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

DROP TRIGGER IF EXISTS trg_enqueue_embedding_behavior ON public.behavior_chunks;
CREATE TRIGGER trg_enqueue_embedding_behavior
  BEFORE INSERT ON public.behavior_chunks
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

DROP TRIGGER IF EXISTS trg_enqueue_embedding_behavior_upd ON public.behavior_chunks;
CREATE TRIGGER trg_enqueue_embedding_behavior_upd
  BEFORE UPDATE OF situacao_descricao, instrucao ON public.behavior_chunks
  FOR EACH ROW
  WHEN (OLD.situacao_descricao IS DISTINCT FROM NEW.situacao_descricao
     OR OLD.instrucao IS DISTINCT FROM NEW.instrucao)
  EXECUTE FUNCTION public.enqueue_embedding_job();

DROP TRIGGER IF EXISTS trg_enqueue_embedding_trigger ON public.trigger_chunks;
CREATE TRIGGER trg_enqueue_embedding_trigger
  BEFORE INSERT ON public.trigger_chunks
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

DROP TRIGGER IF EXISTS trg_enqueue_embedding_trigger_upd ON public.trigger_chunks;
CREATE TRIGGER trg_enqueue_embedding_trigger_upd
  BEFORE UPDATE OF exemplo_frase ON public.trigger_chunks
  FOR EACH ROW
  WHEN (OLD.exemplo_frase IS DISTINCT FROM NEW.exemplo_frase)
  EXECUTE FUNCTION public.enqueue_embedding_job();

DROP TRIGGER IF EXISTS trg_enqueue_embedding_human ON public.human_chunks;
CREATE TRIGGER trg_enqueue_embedding_human
  BEFORE INSERT ON public.human_chunks
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

DROP TRIGGER IF EXISTS trg_enqueue_embedding_human_upd ON public.human_chunks;
CREATE TRIGGER trg_enqueue_embedding_human_upd
  BEFORE UPDATE OF contexto_uso ON public.human_chunks
  FOR EACH ROW
  WHEN (OLD.contexto_uso IS DISTINCT FROM NEW.contexto_uso)
  EXECUTE FUNCTION public.enqueue_embedding_job();

DROP TRIGGER IF EXISTS trg_enqueue_embedding_leadmem ON public.lead_memory;
CREATE TRIGGER trg_enqueue_embedding_leadmem
  BEFORE INSERT ON public.lead_memory
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

DROP TRIGGER IF EXISTS trg_enqueue_embedding_leadmem_upd ON public.lead_memory;
CREATE TRIGGER trg_enqueue_embedding_leadmem_upd
  BEFORE UPDATE OF fato ON public.lead_memory
  FOR EACH ROW
  WHEN (OLD.fato IS DISTINCT FROM NEW.fato)
  EXECUTE FUNCTION public.enqueue_embedding_job();

CREATE OR REPLACE FUNCTION public.process_embedding_jobs(p_batch int DEFAULT 10)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  msg record;
  v_url text;
  v_key text;
  v_processed int := 0;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'EMBED_FUNCTION_URL' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN 0;
  END IF;

  FOR msg IN SELECT * FROM pgmq.read('embedding_jobs', 60, p_batch) LOOP
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := msg.message
    );
    PERFORM pgmq.delete('embedding_jobs', msg.msg_id);
    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$$;
;
