-- ============================================================
-- Onda 0 — trigger automático de embedding para variation_chunks
-- Adiciona CASE 'variation_chunks' em enqueue_embedding_job
-- e cria os 2 triggers (INSERT + UPDATE OF instrucao)
-- DOWN: ver arquivo _DOWN correspondente
-- ============================================================

-- 1. Atualizar função para incluir variation_chunks
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

-- 2. Trigger INSERT
CREATE TRIGGER trg_enqueue_embedding_variation
  BEFORE INSERT ON public.variation_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_embedding_job();

-- 3. Trigger UPDATE OF instrucao (campo de texto principal)
CREATE TRIGGER trg_enqueue_embedding_variation_upd
  BEFORE UPDATE OF instrucao ON public.variation_chunks
  FOR EACH ROW
  WHEN (OLD.instrucao IS DISTINCT FROM NEW.instrucao)
  EXECUTE FUNCTION public.enqueue_embedding_job();
;
