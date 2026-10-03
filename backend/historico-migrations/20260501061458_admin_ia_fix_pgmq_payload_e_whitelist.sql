-- Corrige schema do payload pgmq do trigger admin_ia_chunks
-- Edge gerar-embedding espera: { table, row_id, text }

CREATE OR REPLACE FUNCTION public.tg_admin_ia_chunks_enqueue_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.embedding_status = 'pending' AND NEW.embedding IS NULL THEN
    PERFORM pgmq.send(
      'embedding_jobs',
      jsonb_build_object(
        'table', 'admin_ia_chunks',
        'row_id', NEW.id::text,
        'text', coalesce(NEW.titulo,'') || E'\n\n' || NEW.conteudo
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
;
