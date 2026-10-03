-- Backup da versão atual antes de mexer
INSERT INTO public._migration_rpc_backup (nome, corpo, criado_em)
SELECT
  'assinar_contrato_publico__pre_data_assinatura',
  pg_get_functiondef(oid),
  now()
FROM pg_proc
WHERE proname = 'assinar_contrato_publico'
ON CONFLICT DO NOTHING;

-- Fix: substituir {{data_assinatura}} pela data BRT do momento da assinatura
-- ANTES do UPDATE final. Token interno da plataforma — cravado pra sempre no
-- texto_contrato. PDF, re-exibição e qualquer cópia futura vão mostrar a
-- data correta da assinatura, não a data de geração do link.
--
-- Mantém assinatura/retorno IDÊNTICOS, search_path original.
CREATE OR REPLACE FUNCTION public.assinar_contrato_publico(p_token uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contrato_id uuid;
  v_status text;
  v_agora timestamptz := now();
  v_texto_banco text;
  v_dados_pag jsonb;
  v_forma jsonb;
  v_modo text;
  v_bloco_full text;
  v_avista text;
  v_parcelado text;
  v_variante text;
  v_total numeric;
  v_parcelas int;
  v_valor_parc numeric;
  v_texto_final text;
  v_data_assinatura_br text;
BEGIN
  IF p_token IS NULL OR p_payload IS NULL THEN
    RAISE EXCEPTION 'token e payload obrigatorios' USING ERRCODE = '22023';
  END IF;

  SELECT id, status, texto_contrato, dados_pagamento
    INTO v_contrato_id, v_status, v_texto_banco, v_dados_pag
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

  v_forma := p_payload->'forma_pagamento_escolhida';
  IF v_texto_banco IS NOT NULL AND position('{{COND_PAG_INI}}' IN v_texto_banco) > 0 THEN
    v_bloco_full := substring(v_texto_banco from '\{\{COND_PAG_INI\}\}[\s\S]*?\{\{COND_PAG_FIM\}\}');
    v_avista     := substring(v_texto_banco from '\{\{VAR_AVISTA\}\}([\s\S]*?)\{\{/VAR_AVISTA\}\}');
    v_parcelado  := substring(v_texto_banco from '\{\{VAR_PARCELADO\}\}([\s\S]*?)\{\{/VAR_PARCELADO\}\}');
    v_modo       := lower(COALESCE(v_forma->>'modo', 'avista'));
    v_total      := COALESCE(NULLIF(v_dados_pag->>'total_avista','')::numeric, 0);

    IF v_modo = 'parcelado' THEN
      v_parcelas   := GREATEST(COALESCE(NULLIF(v_forma->>'parcelas','')::int, 1), 1);
      v_valor_parc := round(v_total / v_parcelas, 2);
      v_variante   := COALESCE(v_parcelado, v_avista, '');
      v_variante   := replace(v_variante, '{NUMERO_PARCELAS}', v_parcelas::text);
      v_variante   := replace(v_variante, '{VALOR_PARCELA}',
                        'R$ ' || replace(to_char(v_valor_parc, 'FM999999990.00'), '.', ','));
      v_variante   := replace(v_variante, '{TOTAL_PARCELADO}',
                        'R$ ' || replace(to_char(round(v_total, 2), 'FM999999990.00'), '.', ','));
    ELSE
      v_variante := COALESCE(v_avista, v_parcelado, '');
    END IF;

    v_variante := replace(v_variante, '{TOTAL_AVISTA}',
                    'R$ ' || replace(to_char(round(v_total, 2), 'FM999999990.00'), '.', ','));

    IF v_bloco_full IS NOT NULL THEN
      v_texto_final := replace(v_texto_banco, v_bloco_full, v_variante);
    ELSE
      v_texto_final := v_texto_banco;
    END IF;
  ELSE
    v_texto_final := COALESCE(p_payload->>'texto_contrato', p_payload->>'contract_text', v_texto_banco);
  END IF;

  -- ── Token interno {{data_assinatura}} cravado em BRT (DD/MM/YYYY) ──
  -- Substitui no texto final antes do UPDATE: PDF/re-exibição vão mostrar
  -- a data REAL da assinatura, não o token literal nem a data de geração.
  v_data_assinatura_br := to_char(v_agora AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
  IF v_texto_final IS NOT NULL THEN
    v_texto_final := replace(v_texto_final, '{{data_assinatura}}', v_data_assinatura_br);
  END IF;

  UPDATE public.contratos
  SET status                     = 'aguardando_validacao',
      assinado_em                = v_agora,
      ip_assinatura              = COALESCE(p_payload->>'ip_assinatura', p_payload->>'signature_ip', 'unknown'),
      hash_contrato              = COALESCE(p_payload->>'hash_contrato', p_payload->>'contract_hash'),
      dados_cliente              = COALESCE(p_payload->'dados_cliente', p_payload->'client_data', dados_cliente),
      metodo_pagamento           = COALESCE(p_payload->>'metodo_pagamento', p_payload->>'payment_method', metodo_pagamento),
      forma_pagamento_escolhida  = COALESCE(v_forma, forma_pagamento_escolhida),
      texto_contrato             = v_texto_final,
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
$function$;
;
