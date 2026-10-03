CREATE OR REPLACE FUNCTION public.aprovar_trecho_conversa_para_rag(p_tenant_id uuid, p_conversation_id uuid, p_message_ids uuid[], p_tipo text, p_categoria text, p_admin_id uuid, p_chunk_candidate_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_conteudo text;
  v_chunk_id uuid;
  v_count int;
BEGIN
  PERFORM 1 FROM public.conversas WHERE id = p_conversation_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation % não pertence ao tenant %', p_conversation_id, p_tenant_id USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT string_agg(m.role || ': ' || m.content, E'\n' ORDER BY m.created_at ASC), count(*)
  INTO v_conteudo, v_count FROM public.mensagens m
  WHERE m.id = ANY(p_message_ids) AND m.conversation_id = p_conversation_id;
  IF v_count = 0 OR v_conteudo IS NULL THEN RAISE EXCEPTION 'nenhuma mensagem encontrada pra excerto' USING ERRCODE = 'no_data_found'; END IF;
  INSERT INTO public.blocos_conhecimento (tenant_id, escopo, tipo, categoria, conteudo, embedding_status, ativa, created_by, criado_em, atualizado_em)
  VALUES (p_tenant_id, 'tenant', p_tipo, p_categoria, v_conteudo, 'pendente', true, p_admin_id, now(), now())
  RETURNING id INTO v_chunk_id;
  IF p_chunk_candidate_id IS NOT NULL THEN
    UPDATE public.candidatos_bloco SET status = 'promoted', promoted_bloco_id = v_chunk_id, promoted_bloco_table = 'blocos_conhecimento', decided_at = now(), decided_by = p_admin_id
    WHERE id = p_chunk_candidate_id AND tenant_id = p_tenant_id;
  END IF;
  RETURN v_chunk_id;
END;
$function$

