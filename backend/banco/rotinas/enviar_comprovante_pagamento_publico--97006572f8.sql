CREATE OR REPLACE FUNCTION public.enviar_comprovante_pagamento_publico(p_token uuid, p_proof_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_contract_id uuid;
BEGIN
  IF p_token IS NULL OR p_proof_url IS NULL OR btrim(p_proof_url) = '' THEN RAISE EXCEPTION 'token e url obrigatorios' USING ERRCODE = '22023'; END IF;
  SELECT id INTO v_contract_id FROM public.contratos WHERE chave_publica = p_token LIMIT 1;
  IF v_contract_id IS NULL THEN RAISE EXCEPTION 'contrato nao encontrado' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.verificar_limite_taxa_publico(p_token::text, 'submit_payment_proof_public', 5);
  UPDATE public.contratos SET url_comprovante_pagamento = p_proof_url WHERE id = v_contract_id;
END;
$function$

