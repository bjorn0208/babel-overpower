CREATE OR REPLACE FUNCTION public.submeter_consulta_publica(p_token uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_status text;
  v_origem text;
  v_tenant uuid;
  v_tipo_id uuid;
  v_doc_tipo text;
  v_tipo_resolvido uuid;
  v_preco numeric(10,2);
BEGIN
  SELECT id, status, origem, tenant_id, tipo_id
    INTO v_id, v_status, v_origem, v_tenant, v_tipo_id
  FROM public.consultas
  WHERE chave_publica = p_token AND deleted_at IS NULL
  FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'consulta_nao_encontrada');
  END IF;
  IF v_origem <> 'link' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'consulta_nao_e_link');
  END IF;
  IF v_status IN ('consultando', 'concluida') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'consulta_ja_processada');
  END IF;

  v_doc_tipo := p_payload->>'tipo_doc';

  -- Link universal: resolve o tipo pelo documento (só se ainda não fixado).
  IF v_tipo_id IS NULL AND v_doc_tipo IS NOT NULL THEN
    SELECT id INTO v_tipo_resolvido
    FROM public.consultas_tipos
    WHERE ativo AND deleted_at IS NULL
      AND (tipo_doc = v_doc_tipo OR tipo_doc = 'ambos')
    ORDER BY (tipo_doc = v_doc_tipo) DESC, ordem ASC
    LIMIT 1;
  END IF;

  -- Preço cobrado: pelo tipo de documento (config do tenant), fallback no preço único legado.
  IF v_doc_tipo = 'cpf' THEN
    SELECT COALESCE(preco_venda_cpf, preco_venda_padrao) INTO v_preco
    FROM public.consultas_config_tenant WHERE tenant_id = v_tenant;
  ELSIF v_doc_tipo = 'cnpj' THEN
    SELECT COALESCE(preco_venda_cnpj, preco_venda_padrao) INTO v_preco
    FROM public.consultas_config_tenant WHERE tenant_id = v_tenant;
  END IF;

  UPDATE public.consultas SET
    documento = COALESCE(p_payload->>'documento', documento),
    tipo_doc = COALESCE(p_payload->>'tipo_doc', tipo_doc),
    tipo_id = COALESCE(tipo_id, v_tipo_resolvido),
    preco = COALESCE(preco, v_preco),
    dados_cliente = COALESCE(p_payload->'dados_cliente', dados_cliente),
    url_selfie = COALESCE(p_payload->>'url_selfie', url_selfie),
    url_documento = COALESCE(p_payload->>'url_documento', url_documento),
    url_comprovante_pagamento = COALESCE(p_payload->>'url_comprovante', url_comprovante_pagamento),
    status = 'comprovante_enviado'
  WHERE id = v_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$

