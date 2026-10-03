
-- RPC que monta um contrato a partir do molde do tenant + carrinho da conversa.
-- Estratégia A (Theus 2026-05-16): montagem 100% mecânica, valores só do carrinho/template,
-- LLM nunca inventa cláusula nem valor. SECURITY DEFINER + search_path='' (roda sob service_role
-- na edge -> resolve tenant pela conversa, NUNCA por auth.uid()).
CREATE OR REPLACE FUNCTION public.gerar_contrato_do_template(
  p_conversa_id uuid,
  p_template_id uuid DEFAULT NULL,
  p_dados_cliente jsonb DEFAULT '{}'::jsonb,
  p_tenant_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_agente_id uuid DEFAULT NULL
)
RETURNS TABLE(contrato_id uuid, chave_publica uuid, nome_template text, total numeric, qtd_itens integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid;
  v_lead uuid;
  v_agente uuid;
  v_tpl public.contratos_template%ROWTYPE;
  v_texto text;
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
BEGIN
  IF p_conversa_id IS NULL THEN
    RAISE EXCEPTION 'conversa_id obrigatório para gerar contrato';
  END IF;

  -- 1. Resolve tenant/lead/agente pela conversa (override por params explícitos quando vierem da edge)
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

  -- 2. Resolve o molde ativo: id explícito > molde do produto no carrinho > molde guarda-chuva > 1º ativo
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

  -- 3. Carrinho da conversa -> total + bloco de itens (valores SÓ do carrinho)
  SELECT COALESCE(SUM(cc.quantidade * cc.preco_unitario), 0), COUNT(*)
    INTO v_total_carrinho, v_qtd
  FROM public.carrinho_da_conversa cc
  WHERE cc.conversa_id = p_conversa_id;

  v_total := CASE WHEN v_total_carrinho > 0 THEN v_total_carrinho ELSE COALESCE(v_tpl.valor_a_vista, 0) END;

  IF v_qtd > 0 THEN
    SELECT string_agg(
      '- ' || to_char(cc.quantidade, 'FM999999990') || 'x ' || COALESCE(p.nome, 'Item')
      || CASE WHEN cc.preco_unitario > 0
              THEN ' — R$ ' || replace(to_char(round(cc.preco_unitario, 2), 'FM999999990.00'), '.', ',')
                   || ' (subtotal R$ ' || replace(to_char(round(cc.quantidade * cc.preco_unitario, 2), 'FM999999990.00'), '.', ',') || ')'
              ELSE '' END,
      E'\n' ORDER BY cc.adicionado_em)
      INTO v_itens_txt
    FROM public.carrinho_da_conversa cc
    LEFT JOIN public.produtos p ON p.id = cc.produto_id
    WHERE cc.conversa_id = p_conversa_id;

    v_bloco_itens := 'ITENS CONTRATADOS' || E'\n' || COALESCE(v_itens_txt, '')
      || E'\n\n' || 'VALOR TOTAL: R$ ' || replace(to_char(round(v_total, 2), 'FM999999990.00'), '.', ',');
  END IF;

  -- 4. Parcelamento (1ª opção do template)
  v_parc := COALESCE(v_tpl.opcoes_parcelamento -> 0, '{}'::jsonb);
  v_entrada    := NULLIF(v_parc ->> 'entrada', '')::numeric;
  v_parcelas   := NULLIF(v_parc ->> 'parcelas', '')::integer;
  v_valor_parc := NULLIF(v_parc ->> 'valor_parcela', '')::numeric;
  v_total_parc := COALESCE(v_entrada, 0) + COALESCE(v_parcelas, 0) * COALESCE(v_valor_parc, 0);

  -- 5. Monta o corpo (mecânico). Mantém o texto do autor do template; só resolve tokens.
  v_texto := COALESCE(v_tpl.conteudo, '');

  -- blocos condicionais: remove só os marcadores, mantém o texto (fiel ao molde)
  v_texto := replace(v_texto, '{SE_A_VISTA}', '');
  v_texto := replace(v_texto, '{/SE_A_VISTA}', '');
  v_texto := replace(v_texto, '{SE_PARCELADO}', '');
  v_texto := replace(v_texto, '{/SE_PARCELADO}', '');

  -- tokens de pagamento/produto (valores do template)
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

  -- itens: token dedicado se existir; senão injeta bloco antes do fim
  IF position('{ITENS_CONTRATADOS}' IN v_texto) > 0 THEN
    v_texto := replace(v_texto, '{ITENS_CONTRATADOS}', v_bloco_itens);
  ELSIF v_bloco_itens <> '' THEN
    v_texto := v_texto || E'\n\n' || v_bloco_itens;
  END IF;

  -- normaliza placeholders de cliente pro formato {{campo}} que a página pública hidrata
  -- (campos coletados na identificação: nome_completo, cpf, telefone, email)
  v_texto := replace(v_texto, '[NOME_COMPLETO]', '{{nome_completo}}');
  v_texto := replace(v_texto, '[NOME]', '{{nome_completo}}');
  v_texto := replace(v_texto, '[CPF]', '{{cpf}}');
  v_texto := replace(v_texto, '[TELEFONE]', '{{telefone}}');
  v_texto := replace(v_texto, '[EMAIL]', '{{email}}');

  -- 6. Cria o contrato (origem='agente') + itens
  INSERT INTO public.contratos
    (tenant_id, lead_id, agente_id, conversa_id, nome_template, titulo, texto_contrato,
     origem, status, dados_cliente, chave_pix, link_parcelamento, posicao_pagamento,
     num_testemunhas, instrucao_selfie, campos_obrigatorios)
  VALUES
    (v_tenant, v_lead, v_agente, p_conversa_id, v_tpl.nome,
     COALESCE(NULLIF(v_tpl.nome, ''), 'Contrato'), v_texto,
     'agente', 'pendente', COALESCE(p_dados_cliente, '{}'::jsonb),
     v_tpl.chave_pix, v_tpl.link_parcelamento, v_tpl.posicao_pagamento,
     COALESCE(v_tpl.num_testemunhas, 1), v_tpl.instrucao_selfie,
     to_jsonb(COALESCE(v_tpl.campos_obrigatorios, ARRAY[]::text[])))
  RETURNING id, public.contratos.chave_publica INTO v_contrato_id, v_chave;

  INSERT INTO public.contrato_itens
    (contrato_id, produto_id, nome_snapshot, quantidade, preco_unitario, subtotal, ordem)
  SELECT v_contrato_id, cc.produto_id, COALESCE(p.nome, 'Item'),
         cc.quantidade, cc.preco_unitario, round(cc.quantidade * cc.preco_unitario, 2),
         (row_number() OVER (ORDER BY cc.adicionado_em))::int - 1
  FROM public.carrinho_da_conversa cc
  LEFT JOIN public.produtos p ON p.id = cc.produto_id
  WHERE cc.conversa_id = p_conversa_id;

  RETURN QUERY SELECT v_contrato_id, v_chave, v_tpl.nome, v_total, v_qtd;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_contrato_do_template(uuid, uuid, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_contrato_do_template(uuid, uuid, jsonb, uuid, uuid, uuid) TO authenticated, service_role;

-- Defesa em profundidade: RLS de contrato_itens passa a isolar por tenant do contrato.
DROP POLICY IF EXISTS contrato_itens_via_contrato ON public.contrato_itens;
CREATE POLICY contrato_itens_via_contrato ON public.contrato_itens
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos c
                 WHERE c.id = contrato_itens.contrato_id
                   AND c.tenant_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contratos c
                 WHERE c.id = contrato_itens.contrato_id
                   AND c.tenant_id = (select auth.uid())));

;
