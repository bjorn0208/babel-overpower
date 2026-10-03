-- v8 da assinar_contrato_publico — texto assinado fiel à escolha do lead.
-- Muda SÓ a resolução do bloco {{COND_PAG_INI}}:
--  1. parcelado resolve tokens pela opção dos planos (entrada + parcela cravada do Postgres),
--     fallback dados do molde, último recurso total/parcelas (comportamento v7);
--  2. {VALOR_ENTRADA} agora é substituído;
--  3. composicao=separado → bloco padronizado com 1 linha por produto (planos.separado).
-- Backup da versão anterior em _migration_rpc_backup ('assinar_contrato_publico__pre_v8').

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
  v_composicao text;
  v_bloco_full text;
  v_avista text;
  v_parcelado text;
  v_variante text;
  v_total numeric;
  v_parcelas int;
  v_valor_parc numeric;
  v_entrada numeric;
  v_total_parc numeric;
  v_texto_final text;
  v_data_assinatura_br text;
  -- v8:
  v_planos jsonb;
  v_opcao jsonb;
  v_plano jsonb;
  v_esc jsonb;
  v_prod_id text;
  v_prod_nome text;
  v_modo_prod text;
  v_parc_prod int;
  v_linhas text := '';
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
    v_composicao := lower(COALESCE(v_forma->>'composicao', 'junto'));
    v_total      := COALESCE(NULLIF(v_dados_pag->>'total_avista','')::numeric, 0);
    v_planos     := v_dados_pag->'planos';

    IF v_composicao = 'separado'
       AND jsonb_typeof(v_planos->'separado') = 'array'
       AND jsonb_array_length(v_planos->'separado') > 0 THEN
      -- v8: cobrança separada — 1 linha por produto, valores da fonte única (planos.separado)
      FOR v_plano IN SELECT * FROM jsonb_array_elements(v_planos->'separado') LOOP
        v_prod_id   := v_plano->'por_produto'->0->>'produto_id';
        v_prod_nome := COALESCE(v_plano->'por_produto'->0->>'nome', 'Item');

        SELECT e INTO v_esc
        FROM jsonb_array_elements(COALESCE(v_forma->'por_produto', '[]'::jsonb)) e
        WHERE e->>'produto_id' = v_prod_id
        LIMIT 1;
        v_modo_prod := lower(COALESCE(v_esc->>'modo', 'avista'));

        IF v_modo_prod = 'parcelado' AND jsonb_typeof(v_plano->'opcoes') = 'array' THEN
          v_parc_prod := COALESCE(NULLIF(v_esc->>'parcelas','')::int, (v_plano->>'max_parcelas')::int, 1);
          SELECT o INTO v_opcao FROM jsonb_array_elements(v_plano->'opcoes') o
          WHERE (o->>'parcelas')::int = v_parc_prod LIMIT 1;
          IF v_opcao IS NULL THEN
            SELECT o INTO v_opcao FROM jsonb_array_elements(v_plano->'opcoes') o
            ORDER BY (o->>'parcelas')::int DESC LIMIT 1;
          END IF;
          v_linhas := v_linhas || '- ' || v_prod_nome || ': '
            || CASE WHEN COALESCE((v_opcao->>'entrada_centavos')::numeric, 0) > 0
                 THEN 'entrada de R$ ' || replace(to_char(round((v_opcao->>'entrada_centavos')::numeric / 100, 2), 'FM999999990.00'), '.', ',') || ' + '
                 ELSE '' END
            || (v_opcao->>'parcelas') || 'x de R$ '
            || replace(to_char(round((v_opcao->>'valor_parcela_centavos')::numeric / 100, 2), 'FM999999990.00'), '.', ',')
            || ' (total R$ ' || replace(to_char(round((v_opcao->>'total_centavos')::numeric / 100, 2), 'FM999999990.00'), '.', ',') || ')'
            || E'\n';
        ELSE
          v_linhas := v_linhas || '- ' || v_prod_nome || ': R$ '
            || replace(to_char(round((v_plano->>'total_centavos')::numeric / 100, 2), 'FM999999990.00'), '.', ',')
            || ' à vista' || E'\n';
        END IF;
      END LOOP;
      v_variante := 'CONDIÇÕES DE PAGAMENTO (cobrança separada por produto):' || E'\n' || rtrim(v_linhas, E'\n');

    ELSIF v_modo = 'parcelado' THEN
      v_variante := COALESCE(v_parcelado, v_avista, '');

      -- v8: tokens resolvidos pela opção do plano "junto" (fonte única: entrada + cravada)
      v_opcao := NULL;
      IF jsonb_typeof(v_planos->'junto'->'opcoes') = 'array' THEN
        v_parcelas := COALESCE(NULLIF(v_forma->>'parcelas','')::int, (v_planos->'junto'->>'max_parcelas')::int, 1);
        SELECT o INTO v_opcao FROM jsonb_array_elements(v_planos->'junto'->'opcoes') o
        WHERE (o->>'parcelas')::int = v_parcelas LIMIT 1;
        IF v_opcao IS NULL THEN
          SELECT o INTO v_opcao FROM jsonb_array_elements(v_planos->'junto'->'opcoes') o
          ORDER BY (o->>'parcelas')::int DESC LIMIT 1;
        END IF;
      END IF;

      IF v_opcao IS NOT NULL THEN
        v_parcelas   := (v_opcao->>'parcelas')::int;
        v_entrada    := round(COALESCE((v_opcao->>'entrada_centavos')::numeric, 0) / 100, 2);
        v_valor_parc := round(COALESCE((v_opcao->>'valor_parcela_centavos')::numeric, 0) / 100, 2);
        v_total_parc := round(COALESCE((v_opcao->>'total_centavos')::numeric, 0) / 100, 2);
      ELSE
        -- fallback: parcelamento do molde gravado na geração; último recurso = divisão simples (v7)
        v_parcelas   := GREATEST(COALESCE(NULLIF(v_forma->>'parcelas','')::int, NULLIF(v_dados_pag->>'parcelas','')::int, 1), 1);
        v_entrada    := COALESCE(NULLIF(v_dados_pag->>'entrada','')::numeric, 0);
        v_valor_parc := COALESCE(NULLIF(v_dados_pag->>'valor_parcela','')::numeric,
                                 round((v_total - v_entrada) / v_parcelas, 2));
        v_total_parc := round(v_entrada + v_parcelas * v_valor_parc, 2);
      END IF;

      v_variante := replace(v_variante, '{NUMERO_PARCELAS}', v_parcelas::text);
      v_variante := replace(v_variante, '{VALOR_PARCELA}',
                      'R$ ' || replace(to_char(v_valor_parc, 'FM999999990.00'), '.', ','));
      v_variante := replace(v_variante, '{TOTAL_PARCELADO}',
                      'R$ ' || replace(to_char(v_total_parc, 'FM999999990.00'), '.', ','));
      v_variante := replace(v_variante, '{VALOR_ENTRADA}',
                      CASE WHEN v_entrada > 0
                        THEN 'R$ ' || replace(to_char(v_entrada, 'FM999999990.00'), '.', ',')
                        ELSE '' END);
    ELSE
      v_variante := COALESCE(v_avista, v_parcelado, '');
    END IF;

    v_variante := replace(v_variante, '{TOTAL_AVISTA}',
                    'R$ ' || replace(to_char(round(v_total, 2), 'FM999999990.00'), '.', ','));
    -- v8: entrada também pode aparecer na variante à vista de moldes antigos — limpar token órfão
    v_variante := replace(v_variante, '{VALOR_ENTRADA}', '');

    IF v_bloco_full IS NOT NULL THEN
      v_texto_final := replace(v_texto_banco, v_bloco_full, v_variante);
    ELSE
      v_texto_final := v_texto_banco;
    END IF;
  ELSE
    v_texto_final := COALESCE(p_payload->>'texto_contrato', p_payload->>'contract_text', v_texto_banco);
  END IF;

  -- ── Token interno {{data_assinatura}} cravado em BRT (DD/MM/YYYY) ──
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
