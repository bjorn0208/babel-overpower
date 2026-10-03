
-- Catraca de 3 portões pra venda de consulta pelo agente:
--   1) app 'consulta' instalado (só exige se está no catálogo da loja)
--   2) toggle agente_pode_vender ligado
--   3) saldo >= custo de 1 consulta (tipo padrão do tenant; fallback menor custo ativo)
-- Faltou um → não pode vender. Fonte única reusada pelo motor e pelo gerar_link_consulta.
CREATE OR REPLACE FUNCTION public.consulta_pode_vender(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant uuid := COALESCE(p_tenant_id, (select auth.uid()));
  v_exige_instalacao boolean;
  v_instalado boolean;
  v_toggle boolean;
  v_tipo_padrao uuid;
  v_saldo numeric(10,2);
  v_custo_ref numeric(10,2);
BEGIN
  IF v_tenant IS NULL THEN
    RETURN false;
  END IF;

  -- Portão 1: instalação. App só exige instalação se estiver no catálogo ativo da loja.
  SELECT EXISTS (
    SELECT 1 FROM public.loja_aplicativos
    WHERE slug = 'consulta' AND is_active = true
  ) INTO v_exige_instalacao;

  IF v_exige_instalacao THEN
    SELECT EXISTS (
      SELECT 1 FROM public.aplicativos_instalados
      WHERE user_id = v_tenant AND aplicativo_slug = 'consulta'
    ) INTO v_instalado;
    IF NOT v_instalado THEN
      RETURN false;
    END IF;
  END IF;

  -- Portão 2: toggle ligado (+ captura o tipo padrão pra régua de saldo)
  SELECT agente_pode_vender, tipo_padrao_id
    INTO v_toggle, v_tipo_padrao
  FROM public.consultas_config_tenant
  WHERE tenant_id = v_tenant;

  IF COALESCE(v_toggle, false) = false THEN
    RETURN false;
  END IF;

  -- Portão 3: saldo >= custo de 1 consulta
  SELECT COALESCE(saldo, 0) INTO v_saldo
  FROM public.consultas_saldo
  WHERE tenant_id = v_tenant;
  v_saldo := COALESCE(v_saldo, 0);

  v_custo_ref := (
    SELECT custo FROM public.consultas_tipos
    WHERE id = v_tipo_padrao AND ativo = true AND deleted_at IS NULL
  );
  IF v_custo_ref IS NULL THEN
    v_custo_ref := (
      SELECT MIN(custo) FROM public.consultas_tipos
      WHERE ativo = true AND deleted_at IS NULL
    );
  END IF;

  IF v_custo_ref IS NULL OR v_saldo < v_custo_ref THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.consulta_pode_vender(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consulta_pode_vender(uuid) TO authenticated, service_role;

-- gerar_link_consulta passa a exigir a catraca antes de criar a consulta.
-- Protege o agente E o botão do tenant (mesma RPC).
CREATE OR REPLACE FUNCTION public.gerar_link_consulta(p_tenant_id uuid DEFAULT NULL::uuid, p_lead_id uuid DEFAULT NULL::uuid, p_conversa_id uuid DEFAULT NULL::uuid, p_agente_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
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
  v_tenant := COALESCE(v_uid, p_tenant_id);
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
$function$;

;
