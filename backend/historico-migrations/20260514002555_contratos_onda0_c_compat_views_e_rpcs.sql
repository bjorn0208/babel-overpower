-- Onda 0 C: VIEWs transitórias de compatibilidade + RPCs novas (criar_contrato_livre, criar_template_a_partir_de_texto)

-- VIEWs PT-BR -> EN para callers ainda EN durante a janela de migração
CREATE OR REPLACE VIEW public.contratos_legacy_en AS
SELECT
  id, chave_publica, conversa_id AS conversation_id, lead_id, agente_id, tenant_id,
  nome_template AS template_name, texto_contrato AS contract_text,
  dados_cliente AS client_data, status, assinado_em AS signed_at,
  ip_assinatura AS signature_ip, created_at, titulo AS title,
  logo_url, descricao_empresa AS company_description,
  campos_obrigatorios AS required_fields, dados_signatario AS signer_data,
  url_selfie AS selfie_url, url_documento AS document_url,
  hash_contrato AS contract_hash, cor_pagina AS page_color,
  nome_empresa AS company_name, url_assinatura AS signature_url,
  instrucao_selfie AS selfie_instruction,
  dados_testemunha AS witness_data,
  url_selfie_testemunha AS witness_selfie_url,
  url_documento_testemunha AS witness_document_url,
  url_assinatura_testemunha AS witness_signature_url,
  testemunha_assinada_em AS witness_signed_at,
  ip_testemunha AS witness_ip,
  num_testemunhas, campos_cliente AS client_fields,
  opcoes_pagamento AS payment_options, metodo_pagamento AS payment_method,
  detalhes_pagamento AS payment_details, posicao_pagamento AS payment_position,
  chave_pix AS pix_key, link_parcelamento AS installment_link,
  url_comprovante_pagamento AS payment_proof_url,
  origem, pdf_url
FROM public.contratos;

CREATE OR REPLACE VIEW public.contratos_template_legacy_en AS
SELECT
  id, user_id, produto_id, nome, blocos, created_at, updated_at, conteudo,
  campos_obrigatorios AS required_fields,
  instrucao_selfie AS selfie_instruction,
  num_testemunhas, ativo,
  chave_pix AS pix_key,
  link_parcelamento AS installment_link,
  posicao_pagamento AS payment_position,
  opcoes_parcelamento AS installment_options,
  valor_a_vista,
  placeholders
FROM public.contratos_template;

CREATE OR REPLACE VIEW public.documentos_cliente_legacy_en AS
SELECT
  id, lead_id, tenant_id,
  nome_arquivo AS file_name, rotulo AS label,
  caminho_arquivo AS file_path, tamanho_arquivo AS file_size,
  tipo_arquivo AS file_type,
  created_at, updated_at
FROM public.documentos_cliente;

CREATE OR REPLACE VIEW public.pagamentos_cliente_legacy_en AS
SELECT
  id, tenant_id, lead_id,
  contrato_id AS contract_id,
  descricao, valor, data_vencimento, data_pagamento, status,
  metodo_pagamento, observacao, created_at, updated_at,
  comprovante_rejected_motivo
FROM public.pagamentos_cliente;

CREATE OR REPLACE VIEW public.log_acesso_contrato_legacy_en AS
SELECT id, chave_publica, evento AS event, user_agent, ip, created_at, meta
FROM public.log_acesso_contrato;

CREATE OR REPLACE VIEW public.config_contrato_legacy_en AS
SELECT
  id, tenant_id, logo_url,
  nome_empresa AS company_name,
  descricao_empresa AS company_description,
  cor_pagina AS page_color,
  created_at, updated_at,
  campos_obrigatorios_padrao AS default_required_fields,
  instrucao_selfie_padrao AS default_selfie_instruction,
  num_testemunhas_padrao AS default_num_testemunhas
FROM public.config_contrato;

COMMENT ON VIEW public.contratos_legacy_en IS
  'View transitória de compatibilidade EN->PT-BR. Drop após zero Grep matches + tsc + 2 deploys (DEC docs/projetos/app-contratos-ragentic/01-decisao-fechamento-vocabulario.md).';

-- RPC: criar_contrato_livre
CREATE OR REPLACE FUNCTION public.criar_contrato_livre(
  p_texto         text,
  p_titulo        text DEFAULT 'Contrato',
  p_lead_id       uuid DEFAULT NULL,
  p_conversa_id   uuid DEFAULT NULL,
  p_dados_cliente jsonb DEFAULT '{}'::jsonb,
  p_origem        text DEFAULT 'mestre_livre'
)
RETURNS TABLE (id uuid, chave_publica uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_agente_id uuid;
  v_id        uuid;
  v_chave     uuid := gen_random_uuid();
BEGIN
  IF p_texto IS NULL OR btrim(p_texto) = '' THEN
    RAISE EXCEPTION 'texto do contrato obrigatorio' USING ERRCODE = '22023';
  END IF;

  v_tenant_id := (SELECT auth.uid());
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'autenticacao obrigatoria' USING ERRCODE = '42501';
  END IF;

  SELECT a.id INTO v_agente_id
  FROM public.agentes a
  WHERE a.user_id = v_tenant_id
  ORDER BY a.created_at ASC
  LIMIT 1;

  INSERT INTO public.contratos (
    chave_publica, conversa_id, lead_id, agente_id, tenant_id,
    titulo, texto_contrato, dados_cliente, status, origem,
    num_testemunhas, created_at
  ) VALUES (
    v_chave, p_conversa_id, p_lead_id, v_agente_id, v_tenant_id,
    p_titulo, p_texto, p_dados_cliente, 'pendente', p_origem,
    0, now()
  )
  RETURNING public.contratos.id INTO v_id;

  RETURN QUERY SELECT v_id, v_chave;
END;
$$;

COMMENT ON FUNCTION public.criar_contrato_livre IS
  'Cria contrato livre (sem template) e retorna id + chave_publica. Usado por tool gerar_link_contrato_livre do agente mestre (Onda 3) e pelo wizard manual sem template (Onda 1).';

-- RPC: criar_template_a_partir_de_texto
CREATE OR REPLACE FUNCTION public.criar_template_a_partir_de_texto(
  p_nome              text,
  p_texto             text,
  p_placeholders      jsonb DEFAULT '[]'::jsonb,
  p_produto_id        uuid DEFAULT NULL,
  p_num_testemunhas   integer DEFAULT 1,
  p_instrucao_selfie  text DEFAULT NULL,
  p_ativar            boolean DEFAULT false
)
RETURNS TABLE (id uuid, chunks_rag_gerados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

COMMENT ON FUNCTION public.criar_template_a_partir_de_texto IS
  'Cria template de contrato a partir de texto bruto + placeholders detectados (agente mestre Onda 3). Se p_ativar=true, dispara atomizacao RAG automatica.';

;
