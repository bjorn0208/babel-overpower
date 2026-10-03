
-- Bug #10: alinha CHECK pra aceitar 'ready' (que é o que gerar-embedding escreve)

ALTER TABLE public.episodic_memory DROP CONSTRAINT IF EXISTS episodic_memory_embedding_status_check;
ALTER TABLE public.episodic_memory ADD CONSTRAINT episodic_memory_embedding_status_check
  CHECK (embedding_status = ANY (ARRAY['pending','processing','ready','failed']));

ALTER TABLE public.meta_chunks DROP CONSTRAINT IF EXISTS meta_chunks_embedding_status_check;
ALTER TABLE public.meta_chunks ADD CONSTRAINT meta_chunks_embedding_status_check
  CHECK (embedding_status = ANY (ARRAY['pending','processing','ready','failed']));

-- Re-enfileira pendentes
INSERT INTO pgmq.q_embedding_jobs (read_ct, enqueued_at, vt, message)
SELECT 0, now(), now(),
  jsonb_build_object('table', 'episodic_memory', 'row_id', em.id, 'text', em.episodio_resumo)
FROM public.episodic_memory em
WHERE em.embedding_status = 'pending';

;
