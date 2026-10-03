-- Bug fix: enqueue_embedding_job não tratava procedural_chunks
-- Trigger trg_enqueue_embedding_procedural disparava mas função caía no ELSE NULL.
-- Sintaxe: pega nome_procedimento + concat dos campos passo.acao do array passos jsonb.

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
    WHEN 'procedural_chunks' THEN
      coalesce(v_new->>'nome_procedimento','') || E'\n' ||
      coalesce(
        (SELECT string_agg(p->>'acao', E'\n') FROM jsonb_array_elements(coalesce(v_new->'passos','[]'::jsonb)) p),
        ''
      )
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

COMMENT ON FUNCTION public.enqueue_embedding_job() IS
  'Trigger function que enfileira embedding_jobs no pgmq pra processamento async via gerar-embedding edge fn. Cobre 9 tabelas: behavior/trigger/human/variation/knowledge/meta/lead_memory/episodic_memory/procedural_chunks.';
;
