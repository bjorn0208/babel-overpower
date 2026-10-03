CREATE OR REPLACE FUNCTION public.aprovar_depoimento_para_rag(p_testimonial_id uuid, p_admin_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_testimonial public.depoimentos_publicos%ROWTYPE;
  v_chunk_id uuid;
  v_conteudo text;
BEGIN
  SELECT * INTO v_testimonial FROM public.depoimentos_publicos WHERE id = p_testimonial_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'testimonial % não encontrado', p_testimonial_id USING ERRCODE = 'no_data_found'; END IF;
  IF v_testimonial.user_id IS NULL THEN RAISE EXCEPTION 'testimonial sem user_id (tenant)' USING ERRCODE = 'invalid_parameter_value'; END IF;
  v_conteudo := format('Depoimento de %s (nota %s/5): %s', coalesce(v_testimonial.autor_nome, 'cliente anônimo'), coalesce(v_testimonial.nota::text, '-'), v_testimonial.texto);
  INSERT INTO public.blocos_conhecimento (tenant_id, escopo, tipo, categoria, conteudo, embedding_status, ativa, created_by, criado_em, atualizado_em)
  VALUES (v_testimonial.user_id, 'tenant', 'depoimento', 'social_proof', v_conteudo, 'pendente', true, p_admin_id, now(), now())
  RETURNING id INTO v_chunk_id;
  UPDATE public.depoimentos_publicos SET aprovado = true, aprovado_at = now(), rag_bloco_id = v_chunk_id WHERE id = p_testimonial_id;
  RETURN v_chunk_id;
END;
$function$

