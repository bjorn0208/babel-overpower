CREATE OR REPLACE FUNCTION public.gerar_link_consulta(p_tenant_id uuid DEFAULT NULL::uuid, p_lead_id uuid DEFAULT NULL::uuid, p_conversa_id uuid DEFAULT NULL::uuid, p_agente_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_role text := (select auth.role());
  v_tenant uuid;
  v_chave uuid;
  v_selfie boolean;
  v_doc boolean;
  v_produto uuid;
  v_validacao jsonb;
  v_preco_cpf numeric(10,2);
  v_preco_cnpj numeric(10,2);
  v_lead uuid := p_lead_id;
  v_conversa uuid := p_conversa_id;
  v_agente uuid := p_agente_id;
BEGIN
  -- Override de tenant só é permitido para o motor (service_role).
  -- Tenant autenticado usa o próprio auth.uid(); anon não pode injetar tenant.
  IF v_uid IS NOT NULL THEN
    v_tenant := v_uid;
  ELSIF v_role = 'service_role' THEN
    v_tenant := p_tenant_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_tenant');
  END IF;

  -- GATE catraca de venda: app instalado + toggle + saldo. Sem isso, link não nasce.
  IF NOT public.consulta_pode_vender(v_tenant) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'consulta_indisponivel');
  END IF;

  -- authenticated (botão do tenant): link avulso, sem vínculo de lead/conversa.
  IF v_uid IS NOT NULL THEN
    v_lead := NULL; v_conversa := NULL; v_agente := NULL;
  END IF;

  SELECT selfie_ativo, doc_foto_ativo, produto_oferta_id,
         COALESCE(validacao_comprovante, '{}'::jsonb), preco_venda_cpf, preco_venda_cnpj
    INTO v_selfie, v_doc, v_produto, v_validacao, v_preco_cpf, v_preco_cnpj
  FROM public.consultas_config_tenant
  WHERE tenant_id = v_tenant;

  v_chave := gen_random_uuid();

  INSERT INTO public.consultas (
    tenant_id, lead_id, conversa_id, agente_id, origem, status, chave_publica,
    produto_oferta_id, campos_obrigatorios, validacao_comprovante
  ) VALUES (
    v_tenant, v_lead, v_conversa, v_agente, 'link', 'aguardando_pagamento', v_chave,
    v_produto,
    (CASE WHEN v_selfie THEN jsonb_build_array('selfie') ELSE '[]'::jsonb END)
      || (CASE WHEN v_doc THEN jsonb_build_array('documento') ELSE '[]'::jsonb END),
    COALESCE(v_validacao, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'chave_publica', v_chave,
    'preco_cpf', v_preco_cpf,
    'preco_cnpj', v_preco_cnpj
  );
END;
$function$

