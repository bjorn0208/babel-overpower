
-- Item #6 ALTERAÇÕES.md · RPC approve_testimonial_to_rag
CREATE OR REPLACE FUNCTION public.approve_testimonial_to_rag(
  p_testimonial_id uuid,
  p_admin_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_testimonial public.public_testimonials%ROWTYPE;
  v_chunk_id uuid;
  v_conteudo text;
BEGIN
  SELECT * INTO v_testimonial FROM public.public_testimonials WHERE id = p_testimonial_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'testimonial % não encontrado', p_testimonial_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_testimonial.user_id IS NULL THEN
    RAISE EXCEPTION 'testimonial sem user_id (tenant)' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Formata conteúdo legível pro RAG
  v_conteudo := format(
    'Depoimento de %s (nota %s/5): %s',
    coalesce(v_testimonial.autor_nome, 'cliente anônimo'),
    coalesce(v_testimonial.nota::text, '-'),
    v_testimonial.texto
  );

  INSERT INTO public.knowledge_chunks (
    tenant_id, escopo, tipo, categoria, conteudo,
    embedding_status, ativa, created_by, criado_em, atualizado_em
  ) VALUES (
    v_testimonial.user_id, 'tenant', 'depoimento', 'social_proof', v_conteudo,
    'pending', true, p_admin_id, now(), now()
  ) RETURNING id INTO v_chunk_id;

  UPDATE public.public_testimonials
     SET aprovado = true,
         aprovado_at = now(),
         rag_chunk_id = v_chunk_id
   WHERE id = p_testimonial_id;

  RETURN v_chunk_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_testimonial_to_rag(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_testimonial_to_rag(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_testimonial_to_rag IS 'Item #6 ALTERAÇÕES: promove testimonial aprovado para chunk knowledge_chunks (tipo=depoimento, social_proof). Atualiza public_testimonials.aprovado + rag_chunk_id (audit trail).';

;
