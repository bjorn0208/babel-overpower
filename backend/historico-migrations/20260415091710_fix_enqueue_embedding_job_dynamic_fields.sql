-- FASE 11.3 — Fix bloqueador: enqueue_embedding_job quebrava INSERT em behavior_chunks
-- porque PL/pgSQL resolve NEW.<campo> lazily em runtime, entao NEW.exemplo_frase
-- (so existe em trigger_chunks) falhava mesmo no branch nao alcancado do CASE.
-- Solucao idiomatica: serializar NEW em jsonb e acessar campos dinamicamente.

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
    WHEN 'behavior_chunks' THEN coalesce(v_new->>'situacao_descricao','') || E'\n' || coalesce(v_new->>'instrucao','')
    WHEN 'trigger_chunks' THEN v_new->>'exemplo_frase'
    WHEN 'human_chunks' THEN v_new->>'contexto_uso'
    WHEN 'lead_memory' THEN v_new->>'fato'
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
;
