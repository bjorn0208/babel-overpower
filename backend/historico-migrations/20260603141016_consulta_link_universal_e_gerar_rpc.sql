-- App Consulta — link de venda UNIVERSAL + RPC única de geração.
-- 1) gerar_link_consulta: fonte única (botão do tenant + tool do agente). Cria o link SEM
--    fixar tipo/preço (resolve pelo documento que o cliente digita). Retrocompatível.
-- 2) obter_consulta_por_token: passa a expor os 2 preços por tipo (front escolhe pelo doc).
-- 3) submeter_consulta_publica: resolve tipo_id + preço pelo tipo_doc (só quando ainda nulos).

CREATE OR REPLACE FUNCTION public.gerar_link_consulta(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_chave uuid;
  v_selfie boolean;
  v_doc boolean;
  v_produto uuid;
  v_validacao jsonb;
BEGIN
  -- authenticated (app) usa o próprio uid; service_role (edge do agente) passa p_tenant_id.
  v_tenant := COALESCE((select auth.uid()), p_tenant_id);
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_tenant');
  END IF;

  SELECT selfie_ativo, doc_foto_ativo, produto_oferta_id, COALESCE(validacao_comprovante, '{}'::jsonb)
    INTO v_selfie, v_doc, v_produto, v_validacao
  FROM public.consultas_config_tenant
  WHERE tenant_id = v_tenant;

  v_chave := gen_random_uuid();

  INSERT INTO public.consultas (
    tenant_id, origem, status, chave_publica,
    produto_oferta_id, campos_obrigatorios, validacao_comprovante
  ) VALUES (
    v_tenant, 'link', 'aguardando_pagamento', v_chave,
    v_produto,
    (CASE WHEN v_selfie THEN jsonb_build_array('selfie') ELSE '[]'::jsonb END)
      || (CASE WHEN v_doc THEN jsonb_build_array('documento') ELSE '[]'::jsonb END),
    COALESCE(v_validacao, '{}'::jsonb)
  );

  RETURN jsonb_build_object('ok', true, 'chave_publica', v_chave);
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_link_consulta(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.obter_consulta_por_token(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'chave_publica', c.chave_publica,
    'titulo', c.titulo,
    'nome_empresa', COALESCE(c.nome_empresa, e.nome),
    'logo_url', COALESCE(c.logo_url, e.logo_url),
    'banner_url', COALESCE(c.banner_url, e.banner_url),
    'cor_pagina', c.cor_pagina,
    'tipo_doc', COALESCE(c.tipo_doc, t.tipo_doc),
    'preco', c.preco,
    'preco_venda_cpf', cfg.preco_venda_cpf,
    'preco_venda_cnpj', cfg.preco_venda_cnpj,
    'chave_pix', COALESCE(c.chave_pix, cfg.chave_pix, p.chave_pix),
    'campos_obrigatorios', c.campos_obrigatorios,
    'campos_formulario', COALESCE(cfg.campos_formulario, '[]'::jsonb),
    'instrucao_selfie', c.instrucao_selfie,
    'aviso_final', c.aviso_final,
    'status', c.status,
    'resultado', CASE WHEN c.status = 'concluida' THEN c.resultado ELSE NULL END,
    'pdf_url', CASE WHEN c.status = 'concluida' THEN c.pdf_url ELSE NULL END
  )
  FROM public.consultas c
  LEFT JOIN public.consultas_tipos t ON t.id = c.tipo_id
  LEFT JOIN public.empresas e ON e.user_id = c.tenant_id
  LEFT JOIN public.consultas_config_tenant cfg ON cfg.tenant_id = c.tenant_id
  LEFT JOIN public.profiles p ON p.id = c.tenant_id
  WHERE c.chave_publica = p_token AND c.deleted_at IS NULL;
$$;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submeter_consulta_publica(p_token uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;
;
