CREATE OR REPLACE FUNCTION public.definir_contrato_pdf_url_publico(p_token uuid, p_pdf_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_contract_id uuid; v_status text;
BEGIN
  IF p_token IS NULL OR p_pdf_url IS NULL OR btrim(p_pdf_url) = '' THEN RAISE EXCEPTION 'token e pdf_url obrigatorios' USING ERRCODE = '22023'; END IF;
  SELECT id, status INTO v_contract_id, v_status FROM public.contratos WHERE chave_publica = p_token LIMIT 1;
  IF v_contract_id IS NULL THEN RAISE EXCEPTION 'contrato nao encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_status NOT IN ('awaiting_validation', 'signed', 'aguardando_validacao', 'assinado') THEN RAISE EXCEPTION 'status invalido para pdf_url' USING ERRCODE = '42501'; END IF;
  PERFORM public.verificar_limite_taxa_publico(p_token::text, 'set_contract_pdf_url_public', 3);
  UPDATE public.contratos SET pdf_url = p_pdf_url WHERE id = v_contract_id;
END;
$function$

