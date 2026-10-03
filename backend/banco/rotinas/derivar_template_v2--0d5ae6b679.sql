CREATE OR REPLACE FUNCTION public.derivar_template_v2(p_template_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tpl public.contratos_template%ROWTYPE;
  v_conteudo_comum text;
  v_campos_cliente jsonb;
  v_produtos_aceitos jsonb;
  v_tem_curadoria boolean;  -- Δ 2026-09-08
  v_pagamento jsonb;
  v_provas jsonb;
  v_jornada text[];
  v_campos_array jsonb;
  v_campo jsonb;
  v_tipo text;
  v_slugs_texto text[];
  v_slugs_obrigatorios text[];
  v_todos_slugs text[];
  v_slug_item text;
  v_campos_obrigatorios_arr text[];
BEGIN
  SELECT * INTO v_tpl FROM public.contratos_template WHERE id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template % não encontrado', p_template_id;
  END IF;

  -- 3a. conteudo_comum: na FASE 1 espelha o legado SEM transformar
  -- (converter {SE_A_VISTA} aqui vazaria delimitadores crus no contrato —
  --  página pública atual só hidrata {{minúsculo}}, Fase 3 ainda não existe).
  v_conteudo_comum := coalesce(v_tpl.conteudo, '');

  -- 3b. campos_cliente: união dos {{slug}} do texto + campos_obrigatorios legado
  v_slugs_texto := ARRAY(
    SELECT DISTINCT lower(m[1])
    FROM regexp_matches(v_conteudo_comum, '\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}', 'g') AS m
    WHERE lower(m[1]) NOT IN (
      'cond_pag_ini','var_avista','var_parcelado','/var_avista','/var_parcelado','cond_pag_fim',
      'itens_contratados','clausulas_por_produto','total_avista','assinaturas',
      'numero_parcelas','valor_parcela','total_parcelado',
      'produto_nome','produto_qtd','produto_preco_avista','cond_pagamento'
    )
    ORDER BY 1
  );
  v_campos_obrigatorios_arr := coalesce(v_tpl.campos_obrigatorios, ARRAY[]::text[]);
  v_slugs_obrigatorios := ARRAY(
    SELECT lower(f) FROM unnest(v_campos_obrigatorios_arr) AS f
    WHERE lower(f) NOT IN ('selfie','documento','assinatura_manuscrita','testemunha')
    ORDER BY 1
  );
  v_todos_slugs := ARRAY(
    SELECT DISTINCT slug FROM (
      SELECT unnest(v_slugs_texto) AS slug
      UNION SELECT unnest(v_slugs_obrigatorios) AS slug
    ) t WHERE slug IS NOT NULL AND slug <> '' ORDER BY 1
  );
  v_campos_array := '[]'::jsonb;
  FOREACH v_slug_item IN ARRAY v_todos_slugs LOOP
    IF v_slug_item IN ('cpf','cnpj') THEN v_tipo := v_slug_item;
    ELSIF v_slug_item IN ('email') THEN v_tipo := 'email';
    ELSIF v_slug_item IN ('telefone','celular','fone','whatsapp') THEN v_tipo := 'telefone';
    ELSIF v_slug_item IN ('data','data_nascimento','nascimento') THEN v_tipo := 'data';
    ELSE v_tipo := 'texto';
    END IF;
    v_campo := jsonb_build_object(
      'slug', v_slug_item,
      'rotulo', initcap(replace(v_slug_item, '_', ' ')),
      'tipo', v_tipo,
      'obrigatorio', (v_slug_item = ANY(v_slugs_obrigatorios)),
      'icone', null
    );
    v_campos_array := v_campos_array || jsonb_build_array(v_campo);
  END LOOP;
  v_campos_cliente := v_campos_array;

  -- 3c. produtos_aceitos
  -- Δ 2026-09-08 — esta derivação rodava a cada save que tocasse QUALQUER coluna
  -- legada (inclusive `conteudo`, ou seja: a cada tecla no editor) e reconstruía a
  -- lista do zero — repondo produtos removidos e zerando o parcelamento configurado
  -- pelo dono (entrada:0, max_parcelas:12, total:0). Agora só deriva na PRIMEIRA
  -- CARGA, que era o propósito original; havendo curadoria, preserva.
  v_tem_curadoria := jsonb_typeof(v_tpl.produtos_aceitos) = 'array'
                     AND jsonb_array_length(v_tpl.produtos_aceitos) > 0;

  IF v_tem_curadoria THEN
    v_produtos_aceitos := v_tpl.produtos_aceitos;
  ELSE
    v_produtos_aceitos := (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'produto_id', p.id,
          'nome', p.nome,
          'preco_avista', coalesce(
            CASE WHEN v_tpl.produto_id = p.id THEN v_tpl.valor_a_vista ELSE NULL END,
            (SELECT ct2.valor_a_vista FROM public.contratos_template ct2
             WHERE ct2.user_id = v_tpl.user_id AND ct2.produto_id = p.id
               AND ct2.ativo = true AND ct2.valor_a_vista IS NOT NULL
             ORDER BY ct2.updated_at DESC LIMIT 1),
            0
          ),
          'parcelamento', jsonb_build_object('entrada', 0, 'max_parcelas', 12, 'total_parcelado', 0),
          'preco_pendente', NOT EXISTS (
            SELECT 1 FROM public.contratos_template ct3
            WHERE ct3.user_id = v_tpl.user_id AND ct3.produto_id = p.id
              AND ct3.ativo = true AND ct3.valor_a_vista IS NOT NULL AND ct3.valor_a_vista > 0
          )
        )
      ), '[]'::jsonb)
      FROM public.produtos p
      WHERE p.user_id = v_tpl.user_id AND p.ativo = true
    );

  END IF;

  -- 3d. pagamento
  v_pagamento := jsonb_build_object(
    'modo', 'unico',
    'chave_pix', v_tpl.chave_pix,
    'link_parcelamento', v_tpl.link_parcelamento,
    'posicao_pagamento', coalesce(v_tpl.posicao_pagamento, 'before_sign')
  );

  -- 3e. provas
  v_provas := jsonb_build_object(
    'selfie', 'selfie' = ANY(v_campos_obrigatorios_arr),
    'documento', 'documento' = ANY(v_campos_obrigatorios_arr),
    'assinatura_manuscrita', 'assinatura_manuscrita' = ANY(v_campos_obrigatorios_arr),
    'testemunha', 'testemunha' = ANY(v_campos_obrigatorios_arr),
    'num_testemunhas', coalesce(v_tpl.num_testemunhas, 1),
    'instrucao_selfie', v_tpl.instrucao_selfie
  );

  -- 3f. jornada_ordem (default; tenant customiza na Fase 2)
  v_jornada := ARRAY['dados','pagamento','contrato','comprovante','selfie','documento','assinatura','testemunha']::text[];

  -- Gravar SÓ as colunas v2 (não toca legadas — garante anti-recursão do trigger)
  UPDATE public.contratos_template SET
    conteudo_comum = v_conteudo_comum,
    campos_cliente = v_campos_cliente,
    produtos_aceitos = v_produtos_aceitos,
    pagamento = v_pagamento,
    provas = v_provas,
    jornada_ordem = v_jornada
  WHERE id = p_template_id;
END;
$function$

