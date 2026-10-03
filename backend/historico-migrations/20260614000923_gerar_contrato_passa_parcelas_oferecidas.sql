CREATE OR REPLACE FUNCTION public.gerar_contrato_do_template(p_conversa_id uuid, p_template_id uuid DEFAULT NULL::uuid, p_dados_cliente jsonb DEFAULT '{}'::jsonb, p_tenant_id uuid DEFAULT NULL::uuid, p_lead_id uuid DEFAULT NULL::uuid, p_agente_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contrato_id uuid, chave_publica uuid, nome_template text, total numeric, qtd_itens integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_lead uuid;
  v_agente uuid;
  v_tpl public.contratos_template%ROWTYPE;
  v_cfg public.config_contrato%ROWTYPE;
  v_texto text;
  v_tok text;
  v_total numeric := 0;
  v_total_carrinho numeric := 0;
  v_qtd integer := 0;
  v_itens_txt text;
  v_bloco_itens text := '';
  v_parc jsonb;
  v_entrada numeric;
  v_parcelas integer;
  v_valor_parc numeric;
  v_total_parc numeric := 0;
  v_contrato_id uuid;
  v_chave uuid;
  v_cond_full text;
  v_var_avista text;
  v_var_parc text;
  v_inerte text;
  v_clausulas text := '';
  v_dados_pag jsonb;
  v_itens_calc jsonb;
  v_planos jsonb := NULL;
  v_sep jsonb;
  -- F3a:
  v_campos_form jsonb;
  v_exig jsonb;
  v_exig_selfie_prod boolean := false;
  v_exig_test_prod int := 0;
  v_exig_instr_prod text := NULL;
  v_num_testemunhas int;
  v_instrucao_selfie text;
  -- F3c: documento + canvas de assinatura por produto
  v_exig_doc_prod boolean := false;
  v_exig_assin_prod boolean := false;
  v_campos_obrig text[];
BEGIN
  IF p_conversa_id IS NULL THEN
    RAISE EXCEPTION 'conversa_id obrigatório para gerar contrato';
  END IF;

  SELECT c.tenant_id, c.lead_id, c.agente_id
    INTO v_tenant, v_lead, v_agente
  FROM public.conversas c
  WHERE c.id = p_conversa_id;

  v_tenant := COALESCE(p_tenant_id, v_tenant);
  v_lead   := COALESCE(p_lead_id, v_lead);
  v_agente := COALESCE(p_agente_id, v_agente);

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Conversa % não encontrada ou sem tenant', p_conversa_id;
  END IF;

  SELECT * INTO v_cfg FROM public.config_contrato cc WHERE cc.tenant_id = v_tenant;

  IF p_template_id IS NOT NULL THEN
    SELECT t.* INTO v_tpl
    FROM public.contratos_template t
    WHERE t.id = p_template_id AND t.user_id = v_tenant AND t.ativo = true;
  END IF;

  IF v_tpl.id IS NULL THEN
    SELECT t.* INTO v_tpl
    FROM public.contratos_template t
    WHERE t.user_id = v_tenant AND t.ativo = true
    ORDER BY
      (t.produto_id IN (SELECT cc.produto_id FROM public.carrinho_da_conversa cc WHERE cc.conversa_id = p_conversa_id)) DESC,
      (t.produto_id IS NULL) DESC,
      t.created_at ASC
    LIMIT 1;
  END IF;

  IF v_tpl.id IS NULL THEN
    RAISE EXCEPTION 'Nenhum molde de contrato ativo para este tenant. Configure um template em /agente antes de gerar contrato.';
  END IF;

  SELECT COALESCE(SUM(cc.quantidade * COALESCE(p.preco_centavos::numeric / 100, cc.preco_unitario)), 0), COUNT(*)
    INTO v_total_carrinho, v_qtd
  FROM public.carrinho_da_conversa cc
  LEFT JOIN public.produtos p ON p.id = cc.produto_id
  WHERE cc.conversa_id = p_conversa_id;

  v_total := CASE WHEN v_total_carrinho > 0 THEN v_total_carrinho ELSE COALESCE(v_tpl.valor_a_vista, 0) END;
  IF v_total_carrinho <= 0 THEN
    RAISE LOG 'gerar_contrato_do_template: fallback_molde usado (conversa=%, tenant=%)', p_conversa_id, v_tenant;
  END IF;

  IF v_qtd > 0 THEN
    SELECT string_agg(
      '- ' || to_char(cc.quantidade, 'FM999999990') || 'x ' || COALESCE(p.nome, 'Item')
      || CASE WHEN COALESCE(p.preco_centavos::numeric / 100, cc.preco_unitario) > 0
              THEN ' — R$ ' || replace(to_char(round(COALESCE(p.preco_centavos::numeric / 100, cc.preco_unitario), 2), 'FM999999990.00'), '.', ',')
                   || ' (subtotal R$ ' || replace(to_char(round(cc.quantidade * COALESCE(p.preco_centavos::numeric / 100, cc.preco_unitario), 2), 'FM999999990.00'), '.', ',') || ')'
              ELSE '' END,
      E'\n' ORDER BY cc.adicionado_em)
      INTO v_itens_txt
    FROM public.carrinho_da_conversa cc
    LEFT JOIN public.produtos p ON p.id = cc.produto_id
    WHERE cc.conversa_id = p_conversa_id;

    v_bloco_itens := 'ITENS CONTRATADOS' || E'\n' || COALESCE(v_itens_txt, '')
      || E'\n\n' || 'VALOR TOTAL: R$ ' || replace(to_char(round(v_total, 2), 'FM999999990.00'), '.', ',');
  END IF;

  v_parc := COALESCE(v_tpl.opcoes_parcelamento -> 0, '{}'::jsonb);
  v_entrada    := NULLIF(v_parc ->> 'entrada', '')::numeric;
  v_parcelas   := NULLIF(v_parc ->> 'parcelas', '')::integer;
  v_valor_parc := NULLIF(v_parc ->> 'valor_parcela', '')::numeric;
  v_total_parc := COALESCE(v_entrada, 0) + COALESCE(v_parcelas, 0) * COALESCE(v_valor_parc, 0);

  v_texto := CASE
    WHEN v_tpl.conteudo_comum IS NOT NULL AND left(ltrim(v_tpl.conteudo_comum), 9) = '{"type":"'
      THEN COALESCE(NULLIF(v_tpl.conteudo, ''), '')
    ELSE COALESCE(NULLIF(v_tpl.conteudo_comum, ''), v_tpl.conteudo, '')
  END;

  IF position('{COND_PAGAMENTO}' IN v_texto) > 0 THEN
    v_cond_full := substring(v_texto from '\{COND_PAGAMENTO\}[\s\S]*?\{/COND_PAGAMENTO\}');
    IF v_cond_full IS NOT NULL THEN
      v_var_avista := substring(v_cond_full from '\{SE_A_VISTA\}([\s\S]*?)\{/SE_A_VISTA\}');
      v_var_parc   := substring(v_cond_full from '\{SE_PARCELADO\}([\s\S]*?)\{/SE_PARCELADO\}');
      IF v_var_avista IS NULL AND v_var_parc IS NULL THEN
        v_var_avista := substring(v_cond_full from '\{COND_PAGAMENTO\}([\s\S]*?)\{/COND_PAGAMENTO\}');
        v_var_parc   := v_var_avista;
      END IF;
      v_texto := replace(v_texto, v_cond_full, '@@COND_PAGAMENTO_INERTE@@');
    END IF;
  END IF;

  v_texto := replace(v_texto, '{SE_A_VISTA}', '');
  v_texto := replace(v_texto, '{/SE_A_VISTA}', '');
  v_texto := replace(v_texto, '{SE_PARCELADO}', '');
  v_texto := replace(v_texto, '{/SE_PARCELADO}', '');

  v_texto := replace(v_texto, '{PRODUTO_PRECO}',
    'R$ ' || replace(to_char(round(COALESCE(v_tpl.valor_a_vista, v_total), 2), 'FM999999990.00'), '.', ','));
  v_texto := replace(v_texto, '{CHAVE_PIX}', COALESCE(v_tpl.chave_pix, ''));
  v_texto := replace(v_texto, '{LINK_PAGAMENTO}', COALESCE(v_tpl.link_parcelamento, ''));
  v_texto := replace(v_texto, '{VALOR_ENTRADA}',
    CASE WHEN v_entrada IS NULL THEN '' ELSE 'R$ ' || replace(to_char(round(v_entrada, 2), 'FM999999990.00'), '.', ',') END);
  v_texto := replace(v_texto, '{NUMERO_PARCELAS}', COALESCE(v_parcelas::text, ''));
  v_texto := replace(v_texto, '{VALOR_PARCELA}',
    CASE WHEN v_valor_parc IS NULL THEN '' ELSE 'R$ ' || replace(to_char(round(v_valor_parc, 2), 'FM999999990.00'), '.', ',') END);
  v_texto := replace(v_texto, '{TOTAL_PARCELADO}',
    CASE WHEN v_total_parc = 0 THEN '' ELSE 'R$ ' || replace(to_char(round(v_total_parc, 2), 'FM999999990.00'), '.', ',') END);

  v_texto := replace(v_texto, '{TOTAL_AVISTA}',
    'R$ ' || replace(to_char(round(v_total, 2), 'FM999999990.00'), '.', ','));

  -- F3a: cláusulas — miolo do PRODUTO vence o jsonb do molde; calculadas SEMPRE.
  IF v_qtd > 0 THEN
    SELECT COALESCE(string_agg(
             replace(
               replace(
                 replace(
                   COALESCE(NULLIF(p.clausulas_contrato, ''), v_tpl.clausulas_por_produto ->> cc.produto_id::text, ''),
                   '{PRODUTO_NOME}', COALESCE(p.nome, 'Item')
                 ),
                 '{PRODUTO_QTD}', to_char(cc.quantidade, 'FM999999990')
               ),
               '{PRODUTO_PRECO_AVISTA}',
               'R$ ' || replace(to_char(round(COALESCE(p.preco_centavos::numeric / 100, cc.preco_unitario), 2), 'FM999999990.00'), '.', ',')
             ),
             E'\n\n' ORDER BY cc.adicionado_em
           ), '')
      INTO v_clausulas
    FROM public.carrinho_da_conversa cc
    LEFT JOIN public.produtos p ON p.id = cc.produto_id
    WHERE cc.conversa_id = p_conversa_id;
  END IF;

  IF position('{CLAUSULAS_POR_PRODUTO}' IN v_texto) > 0 THEN
    v_texto := replace(v_texto, '{CLAUSULAS_POR_PRODUTO}', COALESCE(v_clausulas, ''));
  ELSIF COALESCE(v_clausulas, '') <> '' THEN
    -- moldura antiga sem o token: miolos anexados ao fim (antes do bloco de itens)
    v_texto := v_texto || E'\n\n' || 'CLÁUSULAS DOS PRODUTOS CONTRATADOS' || E'\n\n' || v_clausulas;
  END IF;

  IF position('{ITENS_CONTRATADOS}' IN v_texto) > 0 THEN
    v_texto := replace(v_texto, '{ITENS_CONTRATADOS}', v_bloco_itens);
  ELSIF v_bloco_itens <> '' THEN
    v_texto := v_texto || E'\n\n' || v_bloco_itens;
  END IF;

  v_texto := replace(v_texto, '[NOME_COMPLETO]', '{{nome_completo}}');
  v_texto := replace(v_texto, '[NOME]', '{{nome_completo}}');
  v_texto := replace(v_texto, '[CPF]', '{{cpf}}');
  v_texto := replace(v_texto, '[TELEFONE]', '{{telefone}}');
  v_texto := replace(v_texto, '[EMAIL]', '{{email}}');
  FOR v_tok IN
    SELECT DISTINCT (regexp_matches(v_texto, '\[([A-Z0-9_]+)\]', 'g'))[1]
  LOOP
    v_texto := replace(v_texto, '[' || v_tok || ']', '{{' || lower(v_tok) || '}}');
  END LOOP;

  IF v_cond_full IS NOT NULL THEN
    v_inerte := '{{COND_PAG_INI}}{{VAR_AVISTA}}' || COALESCE(v_var_avista, '')
                || '{{/VAR_AVISTA}}{{VAR_PARCELADO}}' || COALESCE(v_var_parc, '')
                || '{{/VAR_PARCELADO}}{{COND_PAG_FIM}}';
    v_inerte := replace(v_inerte, '{TOTAL_AVISTA}',
      'R$ ' || replace(to_char(round(v_total, 2), 'FM999999990.00'), '.', ','));
    v_texto := replace(v_texto, '@@COND_PAGAMENTO_INERTE@@', v_inerte);
  END IF;

  -- F2: planos pela fonte única quando todos os itens têm preço.
  IF v_qtd > 0 THEN
    SELECT jsonb_agg(jsonb_build_object(
             'produto_id', cc.produto_id,
             'nome', COALESCE(p.nome, 'Item'),
             'qtd', cc.quantidade,
             'preco_centavos', p.preco_centavos,
             'entrada_centavos', COALESCE(p.entrada_centavos, 0),
             'max_parcelas', COALESCE(p.max_parcelas, 1),
             'valor_parcela_cravado_centavos', p.valor_parcela_cravado_centavos,
             'parcelas_oferecidas', p.parcelas_oferecidas
           ) ORDER BY cc.adicionado_em)
      INTO v_itens_calc
    FROM public.carrinho_da_conversa cc
    LEFT JOIN public.produtos p ON p.id = cc.produto_id
    WHERE cc.conversa_id = p_conversa_id;

    IF v_itens_calc IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_itens_calc) i WHERE (i->>'preco_centavos') IS NULL
    ) THEN
      BEGIN
        SELECT jsonb_agg(public.calcular_plano_pagamento(jsonb_build_array(i)))
          INTO v_sep
        FROM jsonb_array_elements(v_itens_calc) i;
        v_planos := jsonb_build_object(
          'junto', public.calcular_plano_pagamento(v_itens_calc),
          'separado', COALESCE(v_sep, '[]'::jsonb)
        );
      EXCEPTION WHEN OTHERS THEN
        v_planos := NULL;
      END;
    END IF;
  END IF;

  -- F3a: formulário = união dedup por slug (molde primeiro, depois produtos).
  WITH todos AS (
    SELECT campo, 0 AS ord, row_number() OVER () AS seq
    FROM jsonb_array_elements(COALESCE(NULLIF(v_tpl.campos_cliente, '[]'::jsonb), '[]'::jsonb)) campo
    UNION ALL
    SELECT campo, 1, 1000 + row_number() OVER ()
    FROM public.carrinho_da_conversa cc
    JOIN public.produtos p ON p.id = cc.produto_id,
    LATERAL jsonb_array_elements(COALESCE(p.campos_cliente, '[]'::jsonb)) campo
    WHERE cc.conversa_id = p_conversa_id
  ), dedup AS (
    SELECT DISTINCT ON (campo->>'slug') campo, seq
    FROM todos
    ORDER BY campo->>'slug', ord, seq
  )
  SELECT COALESCE(jsonb_agg(campo ORDER BY seq), '[]'::jsonb) INTO v_campos_form FROM dedup;

  -- F3a: exigências = união mais exigente (molde ∪ produtos vendidos).
  -- F3c: + documento e assinatura_manuscrita por produto.
  SELECT COALESCE(bool_or(COALESCE((p.exigencias->>'selfie')::boolean, false)), false),
         COALESCE(MAX(COALESCE((p.exigencias->>'num_testemunhas')::int, 0)), 0),
         MAX(NULLIF(p.exigencias->>'instrucao_selfie', '')),
         COALESCE(bool_or(COALESCE((p.exigencias->>'documento')::boolean, false)), false),
         COALESCE(bool_or(COALESCE((p.exigencias->>'assinatura_manuscrita')::boolean, false)), false)
    INTO v_exig_selfie_prod, v_exig_test_prod, v_exig_instr_prod, v_exig_doc_prod, v_exig_assin_prod
  FROM public.carrinho_da_conversa cc
  JOIN public.produtos p ON p.id = cc.produto_id
  WHERE cc.conversa_id = p_conversa_id;

  v_num_testemunhas  := GREATEST(COALESCE(v_tpl.num_testemunhas, 1), v_exig_test_prod);
  v_instrucao_selfie := CASE
    WHEN v_exig_selfie_prod THEN COALESCE(v_exig_instr_prod, v_tpl.instrucao_selfie, 'Envie uma selfie segurando seu documento.')
    ELSE v_tpl.instrucao_selfie
  END;

  -- F3c: campos_obrigatorios do contrato = molde ∪ exigências dos produtos (só adiciona, nunca remove).
  v_campos_obrig := COALESCE(v_tpl.campos_obrigatorios, ARRAY[]::text[]);
  IF v_exig_doc_prod AND NOT ('documento' = ANY(v_campos_obrig)) THEN
    v_campos_obrig := array_append(v_campos_obrig, 'documento');
  END IF;
  IF v_exig_assin_prod AND NOT ('assinatura_manuscrita' = ANY(v_campos_obrig)) THEN
    v_campos_obrig := array_append(v_campos_obrig, 'assinatura_manuscrita');
  END IF;
  IF v_exig_selfie_prod AND NOT ('selfie' = ANY(v_campos_obrig)) THEN
    v_campos_obrig := array_append(v_campos_obrig, 'selfie');
  END IF;

  v_exig := jsonb_build_object(
    'selfie', (v_instrucao_selfie IS NOT NULL),
    'num_testemunhas', v_num_testemunhas,
    'instrucao_selfie', v_instrucao_selfie,
    'documento', ('documento' = ANY(v_campos_obrig)),
    'assinatura_manuscrita', ('assinatura_manuscrita' = ANY(v_campos_obrig))
  );

  SELECT jsonb_build_object(
    'total_avista', v_total,
    'max_parcelas', COALESCE(v_parcelas, 12),
    'entrada', v_entrada,
    'valor_parcela', v_valor_parc,
    'parcelas', v_parcelas,
    'pagamento', COALESCE(v_tpl.pagamento, '{}'::jsonb),
    'planos', v_planos,
    'fallback_molde', (v_total_carrinho <= 0),
    'por_produto', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'produto_id', cc.produto_id,
               'nome', COALESCE(p.nome, 'Item'),
               'quantidade', cc.quantidade,
               'preco_unitario', COALESCE(p.preco_centavos::numeric / 100, cc.preco_unitario),
               'subtotal', round(cc.quantidade * COALESCE(p.preco_centavos::numeric / 100, cc.preco_unitario), 2)
             ) ORDER BY cc.adicionado_em)
      FROM public.carrinho_da_conversa cc
      LEFT JOIN public.produtos p ON p.id = cc.produto_id
      WHERE cc.conversa_id = p_conversa_id
    ), '[]'::jsonb)
  ) INTO v_dados_pag;

  INSERT INTO public.contratos
    (tenant_id, lead_id, agente_id, conversa_id, nome_template, titulo, texto_contrato,
     origem, status, dados_cliente, chave_pix, link_parcelamento, posicao_pagamento,
     num_testemunhas, instrucao_selfie, campos_obrigatorios,
     logo_url, nome_empresa, descricao_empresa, cor_pagina, dados_pagamento,
     campos_formulario, exigencias, molde_versao)
  VALUES
    (v_tenant, v_lead, v_agente, p_conversa_id, v_tpl.nome,
     COALESCE(NULLIF(v_tpl.nome, ''), 'Contrato'), v_texto,
     'agente', 'pendente', COALESCE(p_dados_cliente, '{}'::jsonb),
     v_tpl.chave_pix, v_tpl.link_parcelamento, v_tpl.posicao_pagamento,
     v_num_testemunhas, v_instrucao_selfie,
     to_jsonb(v_campos_obrig),
     v_cfg.logo_url, v_cfg.nome_empresa, v_cfg.descricao_empresa, v_cfg.cor_pagina,
     v_dados_pag,
     v_campos_form, v_exig, v_tpl.id::text || '@' || COALESCE(v_tpl.updated_at::text, ''))
  RETURNING id, public.contratos.chave_publica INTO v_contrato_id, v_chave;

  INSERT INTO public.contrato_itens
    (contrato_id, produto_id, nome_snapshot, quantidade, preco_unitario, subtotal, ordem)
  SELECT v_contrato_id, cc.produto_id, COALESCE(p.nome, 'Item'),
         cc.quantidade, COALESCE(p.preco_centavos::numeric / 100, cc.preco_unitario),
         round(cc.quantidade * COALESCE(p.preco_centavos::numeric / 100, cc.preco_unitario), 2),
         (row_number() OVER (ORDER BY cc.adicionado_em))::int - 1
  FROM public.carrinho_da_conversa cc
  LEFT JOIN public.produtos p ON p.id = cc.produto_id
  WHERE cc.conversa_id = p_conversa_id;

  RETURN QUERY SELECT v_contrato_id, v_chave, v_tpl.nome, v_total, v_qtd;
END;
$function$;
;
