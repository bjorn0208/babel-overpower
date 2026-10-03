-- 1) RPC pra incrementar vezes_usado (chamada pelo planejador após hybrid_search_meta)
CREATE OR REPLACE FUNCTION public.incrementar_meta_chunks_uso(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.meta_chunks
     SET vezes_usado = coalesce(vezes_usado, 0) + 1,
         updated_at = now()
   WHERE id = ANY(p_ids)
     AND ativo = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.incrementar_meta_chunks_uso(uuid[]) IS
  'Incrementa vezes_usado dos meta_chunks consultados pelo planejador. Idempotente. Alimenta cron-promover-meta-chunks-estaveis (D5/D6 plano agente vivo).';

GRANT EXECUTE ON FUNCTION public.incrementar_meta_chunks_uso(uuid[]) TO authenticated, service_role;

-- 2) Re-enqueue dos meta_chunks travados em pending (force trigger BEFORE UPDATE OF corpo)
UPDATE public.meta_chunks
   SET corpo = corpo
 WHERE embedding_status = 'pending'
   AND embedding IS NULL;
;
