
-- Sprint C · Migration 011 · RPC approve_conversation_excerpt_to_rag

CREATE OR REPLACE FUNCTION public.approve_conversation_excerpt_to_rag(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_message_ids uuid[],
  p_tipo text,
  p_categoria text,
  p_admin_id uuid,
  p_chunk_candidate_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conteudo text;
  v_chunk_id uuid;
  v_count int;
BEGIN
  -- Valida tenant ownership da conversa
  PERFORM 1 FROM public.conversations
   WHERE id = p_conversation_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation % não pertence ao tenant %', p_conversation_id, p_tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Concatena conteúdo das mensagens (em ordem cronológica)
  SELECT
    string_agg(m.role || ': ' || m.content, E'\n' ORDER BY m.created_at ASC),
    count(*)
  INTO v_conteudo, v_count
  FROM public.messages m
  WHERE m.id = ANY(p_message_ids)
    AND m.conversation_id = p_conversation_id;

  IF v_count = 0 OR v_conteudo IS NULL THEN
    RAISE EXCEPTION 'nenhuma mensagem encontrada pra excerto'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Insere chunk
  INSERT INTO public.knowledge_chunks (
    tenant_id, escopo, tipo, categoria, conteudo,
    embedding_status, ativa, created_by, criado_em, atualizado_em
  ) VALUES (
    p_tenant_id, 'tenant', p_tipo, p_categoria, v_conteudo,
    'pending', true, p_admin_id, now(), now()
  ) RETURNING id INTO v_chunk_id;

  -- Se vinculado a candidate, marca promoted (trigger anti-N=1 vai validar)
  IF p_chunk_candidate_id IS NOT NULL THEN
    UPDATE public.chunk_candidates
       SET status = 'promoted',
           promoted_chunk_id = v_chunk_id,
           promoted_chunk_table = 'knowledge_chunks',
           decided_at = now(),
           decided_by = p_admin_id
     WHERE id = p_chunk_candidate_id
       AND tenant_id = p_tenant_id;
  END IF;

  RETURN v_chunk_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_conversation_excerpt_to_rag(uuid, uuid, uuid[], text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_conversation_excerpt_to_rag(uuid, uuid, uuid[], text, text, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_conversation_excerpt_to_rag IS 'Sprint C: promove excerto de conversa real a chunk knowledge_chunks. Valida tenant, concatena messages, opcionalmente marca chunk_candidate como promoted (audit trail).';

;
