CREATE OR REPLACE FUNCTION public.criar_template_a_partir_de_texto(p_nome text, p_texto text, p_placeholders jsonb DEFAULT '[]'::jsonb, p_produto_id uuid DEFAULT NULL::uuid, p_num_testemunhas integer DEFAULT 1, p_instrucao_selfie text DEFAULT NULL::text, p_ativar boolean DEFAULT false)
 RETURNS TABLE(id uuid, chunks_rag_gerados integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id    uuid;
  v_id         uuid;
  v_rag_total  integer := 0;
BEGIN
  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'nome do template obrigatorio' USING ERRCODE = '22023';
  END IF;
  IF p_texto IS NULL OR btrim(p_texto) = '' THEN
    RAISE EXCEPTION 'texto do template obrigatorio' USING ERRCODE = '22023';
  END IF;

  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'autenticacao obrigatoria' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.contratos_template (
    user_id, produto_id, nome, conteudo, placeholders,
    num_testemunhas, instrucao_selfie, ativo
  ) VALUES (
    v_user_id, p_produto_id, p_nome, p_texto, p_placeholders,
    p_num_testemunhas, p_instrucao_selfie, p_ativar
  )
  RETURNING public.contratos_template.id INTO v_id;

  IF p_ativar THEN
    BEGIN
      SELECT chunks_total INTO v_rag_total
      FROM public.sincronizar_template_contrato_para_rag(v_id);
    EXCEPTION WHEN OTHERS THEN
      v_rag_total := 0;
    END;
  END IF;

  RETURN QUERY SELECT v_id, v_rag_total;
END;
$function$

