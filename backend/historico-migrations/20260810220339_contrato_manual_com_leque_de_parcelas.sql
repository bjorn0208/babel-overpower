-- Contrato manual (template sem carrinho) ganha leque de parcelas (regra Theus:
-- nunca só uma forma de pagar). Gera planos.junto via calcular_plano_pagamento v4
-- com item sintético do template: teto = parcelas do template (ou 5), parcela do
-- template vira a cravada. Só quando valor_a_vista > 0.
CREATE OR REPLACE FUNCTION public.criar_contrato_livre_de_template(p_template_id uuid, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contrato_id uuid, chave_publica uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_agente_id uuid;
  v_tpl       public.contratos_template%ROWTYPE;
  v_cfg       public.config_contrato%ROWTYPE;
  v_texto     text;
  v_tok       text;
  v_total     numeric;
  v_parc      jsonb;
  v_entrada   numeric;
  v_parcelas  integer;
  v_valor_parc numeric;
  v_total_parc numeric;
  v_cond_full text;
  v_var_avista text;
  v_var_parc  text;
  v_inerte    text;
  v_chave     uuid := gen_random_uuid();
  v_id        uuid;
  v_dados_pag jsonb;
  v_item_sintetico jsonb;
  v_planos_junto jsonb;
BEGIN
  -- ── Auth ────────────────────────────────────────────────────────────────
  -- auth.uid() prevalece (frontend). Só usa p_tenant_id quando auth.uid() é NULL
  -- (chamada server-side via service_role — ex: Mentor no commandbar).
  v_tenant_id := COALESCE((SELECT auth.uid()), p_tenant_id);
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'autenticacao obrigatoria' USING ERRCODE = '42501';
  END IF;

  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'p_template_id obrigatorio' USING ERRCODE = '22023';
  END IF;

  -- ── Template (valida ownership + ativo) ─────────────────────────────────
  SELECT t.* INTO v_tpl
  FROM public.contratos_template t
  WHERE t.id = p_template_id
    AND t.user_id = v_tenant_id
    AND t.ativo = true;

  IF v_tpl.id IS NULL THEN
    RAISE EXCEPTION 'template % não encontrado, inativo ou de outro tenant', p_template_id
      USING ERRCODE = '42704';
  END IF;

  -- ── Branding (config do tenant) ─────────────────────────────────────────
  SELECT * INTO v_cfg
  FROM public.config_contrato cc
  WHERE cc.tenant_id = v_tenant_id;

  -- ── Primeiro agente do tenant (mesma regra do criar_contrato_livre) ─────
  SELECT a.id INTO v_agente_id
  FROM public.agentes a
  WHERE a.user_id = v_tenant_id
  ORDER BY a.created_at ASC
  LIMIT 1;

  -- ── Texto: prioriza conteudo_comum (editor v2), senão legado ────────────
  -- Defensiva (bug 26/07): conteudo_comum com doc TipTap JSON cru → ignora
  -- e usa o legado (mesma guarda da RPC gerar_contrato_do_template).
  v_texto := CASE
    WHEN v_tpl.conteudo_comum IS NOT NULL AND left(ltrim(v_tpl.conteudo_comum), 9) = '{"type":"'
      THEN COALESCE(NULLIF(v_tpl.conteudo, ''), '')
    ELSE COALESCE(NULLIF(v_tpl.conteudo_comum, ''), v_tpl.conteudo, '')
  END;

  -- ── Total (sem carrinho, usa valor_a_vista do template) ─────────────────
  v_total := COALESCE(v_tpl.valor_a_vista, 0);

  -- ── Opções de parcelamento (primeira do array) ──────────────────────────
  v_parc       := COALESCE(v_tpl.opcoes_parcelamento -> 0, '{}'::jsonb);
  v_entrada    := NULLIF(v_parc ->> 'entrada', '')::numeric;
  v_parcelas   := NULLIF(v_parc ->> 'parcelas', '')::integer;
  v_valor_parc := NULLIF(v_parc ->> 'valor_parcela', '')::numeric;
  v_total_parc := COALESCE(v_entrada, 0) + COALESCE(v_parcelas, 0) * COALESCE(v_valor_parc, 0);

  -- ── {COND_PAGAMENTO}…{/COND_PAGAMENTO} preservado inerte (igual agente) ─
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

  -- ── Tokens monetários não-carrinho ──────────────────────────────────────
  v_texto := replace(v_texto, '{PRODUTO_PRECO}',
    'R$ ' || replace(to_char(round(v_total, 2), 'FM999999990.00'), '.', ','));
  v_texto := replace(v_texto, '{TOTAL_AVISTA}',
    'R$ ' || replace(to_char(round(v_total, 2), 'FM999999990.00'), '.', ','));
  v_texto := replace(v_texto, '{CHAVE_PIX}', COALESCE(v_tpl.chave_pix, ''));
  v_texto := replace(v_texto, '{LINK_PAGAMENTO}', COALESCE(v_tpl.link_parcelamento, ''));
  v_texto := replace(v_texto, '{VALOR_ENTRADA}',
    CASE WHEN v_entrada IS NULL THEN '' ELSE 'R$ ' || replace(to_char(round(v_entrada, 2), 'FM999999990.00'), '.', ',') END);
  v_texto := replace(v_texto, '{NUMERO_PARCELAS}', COALESCE(v_parcelas::text, ''));
  v_texto := replace(v_texto, '{VALOR_PARCELA}',
    CASE WHEN v_valor_parc IS NULL THEN '' ELSE 'R$ ' || replace(to_char(round(v_valor_parc, 2), 'FM999999990.00'), '.', ',') END);
  v_texto := replace(v_texto, '{TOTAL_PARCELADO}',
    CASE WHEN v_total_parc = 0 THEN '' ELSE 'R$ ' || replace(to_char(round(v_total_parc, 2), 'FM999999990.00'), '.', ',') END);

  -- ── Tokens de carrinho viram vazio (Gerador não tem carrinho) ──────────
  v_texto := replace(v_texto, '{ITENS_CONTRATADOS}', '');
  v_texto := replace(v_texto, '{CLAUSULAS_POR_PRODUTO}', '');

  -- ── [TOKEN] → {{token}} (placeholders do formulário) ────────────────────
  v_texto := replace(v_texto, '[NOME_COMPLETO]', '{{nome_completo}}');
  v_texto := replace(v_texto, '[NOME]',          '{{nome_completo}}');
  v_texto := replace(v_texto, '[CPF]',           '{{cpf}}');
  v_texto := replace(v_texto, '[TELEFONE]',      '{{telefone}}');
  v_texto := replace(v_texto, '[EMAIL]',         '{{email}}');
  FOR v_tok IN
    SELECT DISTINCT (regexp_matches(v_texto, '\[([A-Z0-9_]+)\]', 'g'))[1]
  LOOP
    v_texto := replace(v_texto, '[' || v_tok || ']', '{{' || lower(v_tok) || '}}');
  END LOOP;

  -- ── Reinjeta {COND_PAGAMENTO} inerte (igual agente) ─────────────────────
  IF v_cond_full IS NOT NULL THEN
    v_inerte := '{{COND_PAG_INI}}{{VAR_AVISTA}}' || COALESCE(v_var_avista, '')
                || '{{/VAR_AVISTA}}{{VAR_PARCELADO}}' || COALESCE(v_var_parc, '')
                || '{{/VAR_PARCELADO}}{{COND_PAG_FIM}}';
    v_inerte := replace(v_inerte, '{TOTAL_AVISTA}',
      'R$ ' || replace(to_char(round(v_total, 2), 'FM999999990.00'), '.', ','));
    v_texto := replace(v_texto, '@@COND_PAGAMENTO_INERTE@@', v_inerte);
  END IF;

  -- ── Leque de parcelas (2026-08-10): mesmo motor dos contratos de produto ─
  -- Item sintético do template: teto = parcelas configuradas (ou 5), parcela do
  -- template vira a cravada no teto. Só com valor > 0.
  v_planos_junto := NULL;
  IF v_total > 0 THEN
    v_item_sintetico := jsonb_build_array(jsonb_build_object(
      'produto_id', NULL,
      'nome', COALESCE(NULLIF(v_tpl.nome, ''), 'Contrato'),
      'qtd', 1,
      'preco_centavos', round(v_total * 100)::bigint,
      'entrada_centavos', round(COALESCE(v_entrada, 0) * 100)::bigint,
      'max_parcelas', GREATEST(1, COALESCE(v_parcelas, 5)),
      'valor_parcela_cravado_centavos',
        CASE WHEN v_valor_parc IS NULL THEN NULL ELSE round(v_valor_parc * 100)::bigint END
    ));
    v_planos_junto := public.calcular_plano_pagamento(v_item_sintetico);
  END IF;

  -- ── Snapshot pro aceite (sem por_produto, igual sem carrinho) ───────────
  v_dados_pag := jsonb_build_object(
    'total_avista',  v_total,
    'max_parcelas',  COALESCE(v_parcelas, 12),
    'entrada',       v_entrada,
    'valor_parcela', v_valor_parc,
    'parcelas',      v_parcelas,
    'pagamento',     COALESCE(v_tpl.pagamento, '{}'::jsonb),
    'por_produto',   '[]'::jsonb
  );
  IF v_planos_junto IS NOT NULL THEN
    v_dados_pag := v_dados_pag || jsonb_build_object(
      'planos', jsonb_build_object('junto', v_planos_junto, 'separado', '[]'::jsonb)
    );
  END IF;

  -- ── Insert do contrato (mesmas colunas que gerar_contrato_do_template) ──
  INSERT INTO public.contratos (
    tenant_id, lead_id, agente_id, conversa_id, nome_template,
    titulo, texto_contrato, origem, status, dados_cliente,
    chave_pix, link_parcelamento, posicao_pagamento,
    num_testemunhas, instrucao_selfie, campos_obrigatorios,
    logo_url, nome_empresa, descricao_empresa, cor_pagina,
    dados_pagamento, chave_publica
  ) VALUES (
    v_tenant_id, NULL, v_agente_id, NULL, v_tpl.nome,
    COALESCE(NULLIF(v_tpl.nome, ''), 'Contrato'), v_texto,
    'manual_template', 'pendente', '{}'::jsonb,
    v_tpl.chave_pix, v_tpl.link_parcelamento, v_tpl.posicao_pagamento,
    COALESCE(v_tpl.num_testemunhas, 0), v_tpl.instrucao_selfie,
    to_jsonb(COALESCE(v_tpl.campos_obrigatorios, ARRAY[]::text[])),
    v_cfg.logo_url, v_cfg.nome_empresa, v_cfg.descricao_empresa, v_cfg.cor_pagina,
    v_dados_pag, v_chave
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_chave;
END;
$function$;
;
