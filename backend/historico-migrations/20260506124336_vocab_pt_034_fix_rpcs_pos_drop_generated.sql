
-- 1. assinar_contrato_publico
CREATE OR REPLACE FUNCTION public.assinar_contrato_publico(p_token uuid, p_payload jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $function$
DECLARE v_contract_id uuid; v_status text; v_now timestamptz := now();
BEGIN
  IF p_token IS NULL OR p_payload IS NULL THEN RAISE EXCEPTION 'token e payload obrigatorios' USING ERRCODE = '22023'; END IF;
  SELECT id, status INTO v_contract_id, v_status FROM public.contratos WHERE chave_publica = p_token LIMIT 1;
  IF v_contract_id IS NULL THEN RAISE EXCEPTION 'contrato nao encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_status NOT IN ('pending', 'pendente') THEN RAISE EXCEPTION 'contrato ja processado' USING ERRCODE = '42501'; END IF;
  PERFORM public.verificar_limite_taxa_publico(p_token::text, 'sign_contract_public', 5);
  UPDATE public.contratos
  SET status = 'aguardando_validacao', signed_at = v_now,
      signature_ip = COALESCE(p_payload->>'signature_ip', 'unknown'),
      contract_hash = p_payload->>'contract_hash',
      client_data = COALESCE(p_payload->'client_data', client_data),
      payment_method = COALESCE(p_payload->>'payment_method', payment_method),
      contract_text = COALESCE(p_payload->>'contract_text', contract_text),
      signer_data = COALESCE(p_payload->'signer_data', signer_data),
      selfie_url = p_payload->>'selfie_url',
      document_url = p_payload->>'document_url',
      signature_url = p_payload->>'signature_url',
      witness_data = COALESCE(p_payload->'witness_data', witness_data),
      witness_selfie_url = p_payload->>'witness_selfie_url',
      witness_document_url = p_payload->>'witness_document_url',
      witness_signature_url = p_payload->>'witness_signature_url',
      witness_signed_at = CASE WHEN p_payload ? 'witness_signed_at' THEN v_now ELSE witness_signed_at END,
      witness_ip = p_payload->>'witness_ip'
  WHERE id = v_contract_id;
  RETURN v_contract_id;
END;
$function$;

-- 2. definir_contrato_pdf_url_publico
CREATE OR REPLACE FUNCTION public.definir_contrato_pdf_url_publico(p_token uuid, p_pdf_url text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_contract_id uuid; v_status text;
BEGIN
  IF p_token IS NULL OR p_pdf_url IS NULL OR btrim(p_pdf_url) = '' THEN RAISE EXCEPTION 'token e pdf_url obrigatorios' USING ERRCODE = '22023'; END IF;
  SELECT id, status INTO v_contract_id, v_status FROM public.contratos WHERE chave_publica = p_token LIMIT 1;
  IF v_contract_id IS NULL THEN RAISE EXCEPTION 'contrato nao encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_status NOT IN ('awaiting_validation', 'signed', 'aguardando_validacao', 'assinado') THEN RAISE EXCEPTION 'status invalido para pdf_url' USING ERRCODE = '42501'; END IF;
  PERFORM public.verificar_limite_taxa_publico(p_token::text, 'set_contract_pdf_url_public', 3);
  UPDATE public.contratos SET pdf_url = p_pdf_url WHERE id = v_contract_id;
END;
$function$;

-- 3. enviar_comprovante_pagamento_publico
CREATE OR REPLACE FUNCTION public.enviar_comprovante_pagamento_publico(p_token uuid, p_proof_url text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_contract_id uuid;
BEGIN
  IF p_token IS NULL OR p_proof_url IS NULL OR btrim(p_proof_url) = '' THEN RAISE EXCEPTION 'token e url obrigatorios' USING ERRCODE = '22023'; END IF;
  SELECT id INTO v_contract_id FROM public.contratos WHERE chave_publica = p_token LIMIT 1;
  IF v_contract_id IS NULL THEN RAISE EXCEPTION 'contrato nao encontrado' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.verificar_limite_taxa_publico(p_token::text, 'submit_payment_proof_public', 5);
  UPDATE public.contratos SET payment_proof_url = p_proof_url WHERE id = v_contract_id;
END;
$function$;

-- 4. obter_contrato_por_token (precisa DROP por causa de RETURN TABLE com token+agent_id)
DROP FUNCTION IF EXISTS public.obter_contrato_por_token(uuid);
CREATE FUNCTION public.obter_contrato_por_token(p_token uuid)
 RETURNS TABLE(id uuid, chave_publica uuid, title text, contract_text text, logo_url text, company_description text, company_name text, page_color text, client_data jsonb, status text, signed_at timestamp with time zone, required_fields jsonb, selfie_instruction text, num_testemunhas integer, client_fields text[], payment_options jsonb, payment_method text, payment_position text, pix_key text, installment_link text, payment_proof_url text, pdf_url text, conversation_id uuid, agente_id uuid, origem text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $function$
DECLARE v_user_agent text; v_ip text; v_headers jsonb;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'token obrigatorio' USING ERRCODE = '22023'; END IF;
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_user_agent := v_headers->>'user-agent';
    v_ip := COALESCE(split_part(v_headers->>'x-forwarded-for', ',', 1), v_headers->>'cf-connecting-ip');
    INSERT INTO public.log_acesso_contrato (chave_publica, event, user_agent, ip) VALUES (p_token, 'load', v_user_agent, v_ip);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN QUERY
  SELECT c.id, c.chave_publica, c.title, c.contract_text, c.logo_url, c.company_description,
         c.company_name, c.page_color, c.client_data, c.status, c.signed_at,
         c.required_fields, c.selfie_instruction, c.num_testemunhas, c.client_fields,
         c.payment_options, c.payment_method, c.payment_position, c.pix_key,
         c.installment_link, c.payment_proof_url, c.pdf_url, c.conversation_id, c.agente_id,
         c.origem
  FROM public.contratos c WHERE c.chave_publica = p_token LIMIT 1;
END;
$function$;

-- 5. registrar_evento_contrato
CREATE OR REPLACE FUNCTION public.registrar_evento_contrato(p_token uuid, p_event text, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_user_agent text; v_ip text; v_headers jsonb;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'token obrigatorio' USING ERRCODE = '22023'; END IF;
  IF p_event IS NULL OR btrim(p_event) = '' THEN RAISE EXCEPTION 'event obrigatorio' USING ERRCODE = '22023'; END IF;
  PERFORM public.verificar_limite_taxa_publico(p_token::text, 'log_contract_event', 60);
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_user_agent := v_headers->>'user-agent';
    v_ip := COALESCE(split_part(v_headers->>'x-forwarded-for', ',', 1), v_headers->>'cf-connecting-ip');
  EXCEPTION WHEN OTHERS THEN v_user_agent := NULL; v_ip := NULL; END;
  INSERT INTO public.log_acesso_contrato (chave_publica, event, user_agent, ip, meta) VALUES (p_token, p_event, v_user_agent, v_ip, p_meta);
END;
$function$;

-- 6. obter_dados_publicos_empresa
CREATE OR REPLACE FUNCTION public.obter_dados_publicos_empresa(p_token uuid)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_tenant_id uuid; v_result json;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.leads WHERE chave_rastreamento = p_token LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN NULL; END IF;
  SELECT json_build_object('nome', e.nome,'cnpj', e.cnpj,'descricao', e.descricao,'logo_url', e.logo_url,'banner_url', e.banner_url,'whatsapp', e.whatsapp,'instagram', e.instagram,'site', e.site,'cidade', e.cidade,'estado', e.estado) INTO v_result
  FROM public.empresas e WHERE e.user_id = v_tenant_id LIMIT 1;
  RETURN v_result;
END;
$function$;

-- 7. obter_documentos_publicos_cliente
CREATE OR REPLACE FUNCTION public.obter_documentos_publicos_cliente(p_token uuid)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_lead_id uuid; v_result json;
BEGIN
  SELECT id INTO v_lead_id FROM public.leads WHERE chave_rastreamento = p_token LIMIT 1;
  IF v_lead_id IS NULL THEN RETURN '[]'::json; END IF;
  SELECT COALESCE(json_agg(json_build_object('id', d.id,'file_name', d.file_name,'label', d.label,'file_path', d.file_path,'file_type', d.file_type,'created_at', d.created_at) ORDER BY d.created_at DESC), '[]'::json) INTO v_result
  FROM public.documentos_cliente d WHERE d.lead_id = v_lead_id;
  RETURN v_result;
END;
$function$;

-- 8. obter_fluxo_publico_servico
CREATE OR REPLACE FUNCTION public.obter_fluxo_publico_servico(p_token text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_tenant_id uuid; v_flows json;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.leads WHERE chave_rastreamento = p_token::uuid LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN NULL; END IF;
  SELECT ua.product_flows::json INTO v_flows FROM public.agentes_usuario ua WHERE ua.user_id = v_tenant_id LIMIT 1;
  RETURN v_flows;
END;
$function$;

-- 9. calcular_style_profile (m.payload → m.carga)
CREATE OR REPLACE FUNCTION public.calcular_style_profile(p_lead_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_profile jsonb; v_total integer := 0; v_total_chars bigint := 0; v_tamanho_medio integer := 0;
  v_com_emoji integer := 0; v_com_audio integer := 0; v_usa_emoji boolean := false; v_usa_audio boolean := false;
  v_pct_audio float := 0.0; v_registro text := 'neutro'; v_emojis_freq text[] := '{}';
BEGIN
  SELECT COUNT(*)::integer, COALESCE(SUM(length(m.content)), 0)::bigint,
    COUNT(*) FILTER (WHERE m.content ~ '[😀-🙏🌀-🗿🚀-🛿🇦-🇿✂-➰Ⓜ-🉑]' OR m.carga->>'has_audio' = 'true' OR m.carga->>'media_type' = 'audio' OR (m.carga IS NOT NULL AND (m.carga->>'emoji_count')::int > 0))::integer,
    COUNT(*) FILTER (WHERE m.carga->>'has_audio' = 'true' OR m.carga->>'media_type' = 'audio')::integer
  INTO v_total, v_total_chars, v_com_emoji, v_com_audio
  FROM (SELECT m.content, m.carga FROM public.mensagens m JOIN public.conversas c ON c.id = m.conversation_id WHERE c.lead_id = p_lead_id AND m.role = 'user' AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 30) m;
  IF v_total = 0 THEN RETURN NULL; END IF;
  v_tamanho_medio := (v_total_chars / v_total)::integer;
  v_usa_emoji := (v_com_emoji::float / v_total) >= 0.20;
  v_usa_audio := v_com_audio > 0;
  v_pct_audio := ROUND((v_com_audio::float / v_total)::numeric, 2)::float;
  IF v_usa_emoji OR v_tamanho_medio < 60 THEN v_registro := 'informal';
  ELSIF v_tamanho_medio > 200 AND NOT v_usa_emoji THEN v_registro := 'formal';
  ELSE v_registro := 'neutro'; END IF;
  SELECT ARRAY(SELECT DISTINCT regexp_matches(m2.content, '[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0000FE00-\U0000FE0F]+', 'g')
    FROM public.mensagens m2 JOIN public.conversas c2 ON c2.id = m2.conversation_id
    WHERE c2.lead_id = p_lead_id AND m2.role = 'user' AND m2.deleted_at IS NULL AND m2.content ~ '[\U0001F300-\U0001FAFF\U00002600-\U000027BF]' ORDER BY 1 LIMIT 5) INTO v_emojis_freq;
  v_profile := jsonb_build_object('registro', v_registro,'tamanho_medio_msg', v_tamanho_medio,'usa_emoji', v_usa_emoji,'emojis_frequentes', v_emojis_freq,'usa_audio', v_usa_audio,'pct_audio_vs_texto', v_pct_audio);
  UPDATE public.leads_campanha SET perfil_estilo = v_profile WHERE lead_id = p_lead_id AND state = 'ativo';
  RETURN v_profile;
END;
$function$;

;
