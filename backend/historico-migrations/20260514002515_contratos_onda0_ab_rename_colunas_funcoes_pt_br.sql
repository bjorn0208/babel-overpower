-- Onda 0 A+B atômica: rename de colunas EN -> PT-BR + atualização de funções/trigger

-- Bloco 1: contratos (30 colunas)
ALTER TABLE public.contratos RENAME COLUMN conversation_id      TO conversa_id;
ALTER TABLE public.contratos RENAME COLUMN template_name         TO nome_template;
ALTER TABLE public.contratos RENAME COLUMN contract_text         TO texto_contrato;
ALTER TABLE public.contratos RENAME COLUMN client_data           TO dados_cliente;
ALTER TABLE public.contratos RENAME COLUMN signed_at             TO assinado_em;
ALTER TABLE public.contratos RENAME COLUMN signature_ip          TO ip_assinatura;
ALTER TABLE public.contratos RENAME COLUMN title                 TO titulo;
ALTER TABLE public.contratos RENAME COLUMN company_description   TO descricao_empresa;
ALTER TABLE public.contratos RENAME COLUMN required_fields       TO campos_obrigatorios;
ALTER TABLE public.contratos RENAME COLUMN signer_data           TO dados_signatario;
ALTER TABLE public.contratos RENAME COLUMN selfie_url            TO url_selfie;
ALTER TABLE public.contratos RENAME COLUMN document_url          TO url_documento;
ALTER TABLE public.contratos RENAME COLUMN contract_hash         TO hash_contrato;
ALTER TABLE public.contratos RENAME COLUMN page_color            TO cor_pagina;
ALTER TABLE public.contratos RENAME COLUMN company_name          TO nome_empresa;
ALTER TABLE public.contratos RENAME COLUMN signature_url         TO url_assinatura;
ALTER TABLE public.contratos RENAME COLUMN selfie_instruction    TO instrucao_selfie;
ALTER TABLE public.contratos RENAME COLUMN witness_data          TO dados_testemunha;
ALTER TABLE public.contratos RENAME COLUMN witness_selfie_url    TO url_selfie_testemunha;
ALTER TABLE public.contratos RENAME COLUMN witness_document_url  TO url_documento_testemunha;
ALTER TABLE public.contratos RENAME COLUMN witness_signature_url TO url_assinatura_testemunha;
ALTER TABLE public.contratos RENAME COLUMN witness_signed_at     TO testemunha_assinada_em;
ALTER TABLE public.contratos RENAME COLUMN witness_ip            TO ip_testemunha;
ALTER TABLE public.contratos RENAME COLUMN client_fields         TO campos_cliente;
ALTER TABLE public.contratos RENAME COLUMN payment_options       TO opcoes_pagamento;
ALTER TABLE public.contratos RENAME COLUMN payment_method        TO metodo_pagamento;
ALTER TABLE public.contratos RENAME COLUMN payment_details       TO detalhes_pagamento;
ALTER TABLE public.contratos RENAME COLUMN payment_position      TO posicao_pagamento;
ALTER TABLE public.contratos RENAME COLUMN pix_key               TO chave_pix;
ALTER TABLE public.contratos RENAME COLUMN installment_link      TO link_parcelamento;
ALTER TABLE public.contratos RENAME COLUMN payment_proof_url     TO url_comprovante_pagamento;

-- Bloco 2: contratos_template (6 renames + 1 ADD COLUMN placeholders)
ALTER TABLE public.contratos_template RENAME COLUMN required_fields     TO campos_obrigatorios;
ALTER TABLE public.contratos_template RENAME COLUMN selfie_instruction  TO instrucao_selfie;
ALTER TABLE public.contratos_template RENAME COLUMN pix_key             TO chave_pix;
ALTER TABLE public.contratos_template RENAME COLUMN installment_link    TO link_parcelamento;
ALTER TABLE public.contratos_template RENAME COLUMN payment_position    TO posicao_pagamento;
ALTER TABLE public.contratos_template RENAME COLUMN installment_options TO opcoes_parcelamento;
ALTER TABLE public.contratos_template ADD COLUMN IF NOT EXISTS placeholders jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.contratos_template.placeholders IS
  'Lista de placeholders detectados pelo agente mestre: [{nome: "nome_cliente", descricao: "Nome completo do contratante", tipo: "texto"}]. Renderizado dinamicamente no form da página pública.';

-- Bloco 3: documentos_cliente (5 colunas)
ALTER TABLE public.documentos_cliente RENAME COLUMN file_name TO nome_arquivo;
ALTER TABLE public.documentos_cliente RENAME COLUMN label     TO rotulo;
ALTER TABLE public.documentos_cliente RENAME COLUMN file_path TO caminho_arquivo;
ALTER TABLE public.documentos_cliente RENAME COLUMN file_size TO tamanho_arquivo;
ALTER TABLE public.documentos_cliente RENAME COLUMN file_type TO tipo_arquivo;

-- Bloco 4: pagamentos_cliente (1 coluna)
ALTER TABLE public.pagamentos_cliente RENAME COLUMN contract_id TO contrato_id;

-- Bloco 5: log_acesso_contrato (1 coluna)
ALTER TABLE public.log_acesso_contrato RENAME COLUMN event TO evento;

-- Bloco 6: config_contrato (6 colunas)
ALTER TABLE public.config_contrato RENAME COLUMN company_name              TO nome_empresa;
ALTER TABLE public.config_contrato RENAME COLUMN company_description       TO descricao_empresa;
ALTER TABLE public.config_contrato RENAME COLUMN page_color                TO cor_pagina;
ALTER TABLE public.config_contrato RENAME COLUMN default_required_fields   TO campos_obrigatorios_padrao;
ALTER TABLE public.config_contrato RENAME COLUMN default_selfie_instruction TO instrucao_selfie_padrao;
ALTER TABLE public.config_contrato RENAME COLUMN default_num_testemunhas   TO num_testemunhas_padrao;

-- Bloco 7: Rename FK constraints
ALTER TABLE public.contratos          RENAME CONSTRAINT contracts_conversation_id_fkey   TO contratos_conversa_id_fkey;
ALTER TABLE public.contratos          RENAME CONSTRAINT contracts_tenant_id_fkey         TO contratos_tenant_id_fkey;
ALTER TABLE public.contratos          RENAME CONSTRAINT contracts_lead_id_fkey           TO contratos_lead_id_fkey;
ALTER TABLE public.config_contrato    RENAME CONSTRAINT contract_settings_tenant_id_fkey TO config_contrato_tenant_id_fkey;
ALTER TABLE public.documentos_cliente RENAME CONSTRAINT client_documents_lead_id_fkey    TO documentos_cliente_lead_id_fkey;
ALTER TABLE public.documentos_cliente RENAME CONSTRAINT client_documents_tenant_id_fkey  TO documentos_cliente_tenant_id_fkey;
ALTER TABLE public.pagamentos_cliente RENAME CONSTRAINT client_payments_tenant_id_fkey   TO pagamentos_cliente_tenant_id_fkey;
ALTER TABLE public.pagamentos_cliente RENAME CONSTRAINT client_payments_lead_id_fkey     TO pagamentos_cliente_lead_id_fkey;
ALTER TABLE public.pagamentos_cliente RENAME CONSTRAINT client_payments_contract_id_fkey TO pagamentos_cliente_contrato_id_fkey;

-- Bloco 8: Rename índices
ALTER INDEX public.contracts_pkey                    RENAME TO contratos_pkey;
ALTER INDEX public.contracts_lead_id_idx             RENAME TO contratos_lead_id_idx;
ALTER INDEX public.idx_contracts_conversation_id     RENAME TO contratos_conversa_id_idx;
ALTER INDEX public.idx_contracts_tenant_id           RENAME TO contratos_tenant_id_idx;
ALTER INDEX public.contract_settings_pkey            RENAME TO config_contrato_pkey;
ALTER INDEX public.contract_settings_tenant_id_key   RENAME TO config_contrato_tenant_id_key;
ALTER INDEX public.client_documents_pkey             RENAME TO documentos_cliente_pkey;
ALTER INDEX public.idx_client_documents_lead_id      RENAME TO documentos_cliente_lead_id_idx;
ALTER INDEX public.idx_client_documents_tenant_id    RENAME TO documentos_cliente_tenant_id_idx;
ALTER INDEX public.client_payments_pkey              RENAME TO pagamentos_cliente_pkey;
ALTER INDEX public.idx_client_payments_contract_id   RENAME TO pagamentos_cliente_contrato_id_idx;
ALTER INDEX public.idx_client_payments_lead_id       RENAME TO pagamentos_cliente_lead_id_idx;
ALTER INDEX public.idx_client_payments_status        RENAME TO pagamentos_cliente_status_idx;
ALTER INDEX public.idx_client_payments_tenant_id     RENAME TO pagamentos_cliente_tenant_id_idx;
ALTER INDEX public.idx_client_payments_vencimento    RENAME TO pagamentos_cliente_vencimento_idx;
ALTER INDEX public.contract_access_log_pkey          RENAME TO log_acesso_contrato_pkey;
ALTER INDEX public.idx_contract_access_log_created_at RENAME TO log_acesso_contrato_created_at_idx;
ALTER INDEX public.idx_contract_access_log_token     RENAME TO log_acesso_contrato_chave_publica_idx;

-- Bloco 9: Rename trigger
ALTER TRIGGER trg_sync_lead_cards_contract_signed
  ON public.contratos
  RENAME TO trg_sincronizar_fichas_lead_contrato_assinado;

-- Bloco 10: Drop funções EN duplicadas
DROP FUNCTION IF EXISTS public.get_contract_by_token(uuid);
DROP FUNCTION IF EXISTS public.sync_contrato_template_para_rag(uuid);

-- Bloco 11: Trigger function reescrita pros novos nomes
CREATE OR REPLACE FUNCTION public.sincronizar_fichas_lead_ao_assinar_contrato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.assinado_em IS NOT NULL
     AND (OLD.assinado_em IS NULL OR OLD.assinado_em IS DISTINCT FROM NEW.assinado_em)
     AND NEW.conversa_id IS NOT NULL
  THEN
    UPDATE public.fichas_lead
    SET dados_capturados = jsonb_set(
          COALESCE(dados_capturados, '{}'::jsonb),
          '{contrato_assinado}',
          '"sim"'::jsonb,
          true
        ),
        updated_at = now()
    WHERE conversation_id = NEW.conversa_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Bloco 12: obter_contrato_por_token RETURN TABLE pt-br
DROP FUNCTION IF EXISTS public.obter_contrato_por_token(uuid);
CREATE OR REPLACE FUNCTION public.obter_contrato_por_token(p_token uuid)
RETURNS TABLE(
  id uuid, chave_publica uuid, titulo text, texto_contrato text,
  logo_url text, descricao_empresa text, nome_empresa text, cor_pagina text,
  dados_cliente jsonb, status text, assinado_em timestamptz,
  campos_obrigatorios jsonb, instrucao_selfie text, num_testemunhas integer,
  campos_cliente text[], opcoes_pagamento jsonb, metodo_pagamento text,
  posicao_pagamento text, chave_pix text, link_parcelamento text,
  url_comprovante_pagamento text, pdf_url text, conversa_id uuid,
  agente_id uuid, origem text, placeholders jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'auth'
AS $$
DECLARE
  v_user_agent text;
  v_ip text;
  v_headers jsonb;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token obrigatorio' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_user_agent := v_headers->>'user-agent';
    v_ip := COALESCE(split_part(v_headers->>'x-forwarded-for', ',', 1),
                     v_headers->>'cf-connecting-ip');
    INSERT INTO public.log_acesso_contrato (chave_publica, evento, user_agent, ip)
    VALUES (p_token, 'carregamento', v_user_agent, v_ip);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN QUERY
  SELECT
    c.id, c.chave_publica, c.titulo, c.texto_contrato,
    c.logo_url, c.descricao_empresa, c.nome_empresa, c.cor_pagina,
    c.dados_cliente, c.status, c.assinado_em,
    c.campos_obrigatorios, c.instrucao_selfie, c.num_testemunhas,
    c.campos_cliente, c.opcoes_pagamento, c.metodo_pagamento,
    c.posicao_pagamento, c.chave_pix, c.link_parcelamento,
    c.url_comprovante_pagamento, c.pdf_url, c.conversa_id,
    c.agente_id, c.origem,
    COALESCE(ct.placeholders, '[]'::jsonb) AS placeholders
  FROM public.contratos c
  LEFT JOIN public.contratos_template ct
    ON ct.nome = c.nome_template AND ct.user_id = c.tenant_id
  WHERE c.chave_publica = p_token
  LIMIT 1;
END;
$$;

-- Bloco 13: assinar_contrato_publico reescrita
CREATE OR REPLACE FUNCTION public.assinar_contrato_publico(p_token uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'auth'
AS $$
DECLARE
  v_contrato_id uuid;
  v_status text;
  v_agora timestamptz := now();
BEGIN
  IF p_token IS NULL OR p_payload IS NULL THEN
    RAISE EXCEPTION 'token e payload obrigatorios' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_contrato_id, v_status
  FROM public.contratos
  WHERE chave_publica = p_token
  LIMIT 1;

  IF v_contrato_id IS NULL THEN
    RAISE EXCEPTION 'contrato nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_status NOT IN ('pending', 'pendente') THEN
    RAISE EXCEPTION 'contrato ja processado' USING ERRCODE = '42501';
  END IF;

  PERFORM public.verificar_limite_taxa_publico(p_token::text, 'assinar_contrato_publico', 5);

  UPDATE public.contratos
  SET status                     = 'aguardando_validacao',
      assinado_em                = v_agora,
      ip_assinatura              = COALESCE(p_payload->>'ip_assinatura', p_payload->>'signature_ip', 'unknown'),
      hash_contrato              = COALESCE(p_payload->>'hash_contrato', p_payload->>'contract_hash'),
      dados_cliente              = COALESCE(p_payload->'dados_cliente', p_payload->'client_data', dados_cliente),
      metodo_pagamento           = COALESCE(p_payload->>'metodo_pagamento', p_payload->>'payment_method', metodo_pagamento),
      texto_contrato             = COALESCE(p_payload->>'texto_contrato', p_payload->>'contract_text', texto_contrato),
      dados_signatario           = COALESCE(p_payload->'dados_signatario', p_payload->'signer_data', dados_signatario),
      url_selfie                 = COALESCE(p_payload->>'url_selfie', p_payload->>'selfie_url'),
      url_documento              = COALESCE(p_payload->>'url_documento', p_payload->>'document_url'),
      url_assinatura             = COALESCE(p_payload->>'url_assinatura', p_payload->>'signature_url'),
      dados_testemunha           = COALESCE(p_payload->'dados_testemunha', p_payload->'witness_data', dados_testemunha),
      url_selfie_testemunha      = COALESCE(p_payload->>'url_selfie_testemunha', p_payload->>'witness_selfie_url'),
      url_documento_testemunha   = COALESCE(p_payload->>'url_documento_testemunha', p_payload->>'witness_document_url'),
      url_assinatura_testemunha  = COALESCE(p_payload->>'url_assinatura_testemunha', p_payload->>'witness_signature_url'),
      testemunha_assinada_em     = CASE
        WHEN p_payload ? 'testemunha_assinada_em' OR p_payload ? 'witness_signed_at' THEN v_agora
        ELSE testemunha_assinada_em
      END,
      ip_testemunha              = COALESCE(p_payload->>'ip_testemunha', p_payload->>'witness_ip')
  WHERE id = v_contrato_id;

  RETURN v_contrato_id;
END;
$$;

-- Bloco 14: registrar_evento_contrato reescrita (param p_event -> p_evento)
DROP FUNCTION IF EXISTS public.registrar_evento_contrato(uuid, text, jsonb);
CREATE OR REPLACE FUNCTION public.registrar_evento_contrato(
  p_token uuid, p_evento text, p_meta jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_agent text;
  v_ip text;
  v_headers jsonb;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token obrigatorio' USING ERRCODE = '22023';
  END IF;
  IF p_evento IS NULL OR btrim(p_evento) = '' THEN
    RAISE EXCEPTION 'evento obrigatorio' USING ERRCODE = '22023';
  END IF;

  PERFORM public.verificar_limite_taxa_publico(p_token::text, 'registrar_evento_contrato', 60);

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_user_agent := v_headers->>'user-agent';
    v_ip := COALESCE(split_part(v_headers->>'x-forwarded-for', ',', 1),
                     v_headers->>'cf-connecting-ip');
  EXCEPTION WHEN OTHERS THEN
    v_user_agent := NULL;
    v_ip := NULL;
  END;

  INSERT INTO public.log_acesso_contrato (chave_publica, evento, user_agent, ip, meta)
  VALUES (p_token, p_evento, v_user_agent, v_ip, p_meta);
END;
$$;

;
