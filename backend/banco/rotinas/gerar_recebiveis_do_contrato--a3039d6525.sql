CREATE OR REPLACE FUNCTION public.gerar_recebiveis_do_contrato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_forma jsonb;
  v_opcoes jsonb;
  v_opcao jsonb;
  v_parcelas integer;
  v_entrada numeric;
  v_valor_parcela numeric;
  v_total numeric;
  v_nome text;
  v_desc_base text;
  i integer;
  -- 2026-09-17: cobrança separada por produto
  v_separado boolean := false;
  v_plano jsonb;
  v_esc jsonb;
  v_prod_nome text;
  -- numeração única no contrato: uq_contas_a_receber_contrato_parcela impede
  -- que dois produtos usem "parcela 1" no mesmo contrato.
  v_seq integer := 0;
  v_primeira numeric;
BEGIN
  -- idempotente: já gerou pra este contrato → nada a fazer
  IF EXISTS (SELECT 1 FROM public.contas_a_receber WHERE contrato_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_nome := COALESCE(
      NEW.dados_signatario->>'nome_completo',
      NEW.dados_cliente->>'nome_completo',
      (SELECT l.name FROM public.leads l WHERE l.id = NEW.lead_id),
      'contato'
    );
    v_desc_base := COALESCE(NULLIF(NEW.titulo, ''), 'Contrato') || ' · ' || v_nome;

    v_forma := NEW.forma_pagamento_escolhida;
    v_opcoes := NEW.dados_pagamento->'planos'->'junto'->'opcoes';
    v_parcelas := COALESCE((v_forma->>'parcelas')::integer, 1);

    IF lower(COALESCE(v_forma->>'modo', '')) = 'opcao' THEN
      -- opção nomeada (produtos.opcoes_pagamento): mesma forma {entrada, parcelas, valor_parcela}
      SELECT o INTO v_opcao
      FROM jsonb_array_elements(COALESCE(NEW.dados_pagamento->'planos'->'junto'->'opcoes_nomeadas', '[]'::jsonb)) o
      WHERE o->>'id' = v_forma->>'opcao_id' LIMIT 1;
      IF v_opcao IS NOT NULL THEN
        v_parcelas := GREATEST(1, COALESCE((v_opcao->>'parcelas')::integer, 1));
      END IF;
    ELSIF lower(COALESCE(v_forma->>'composicao', 'junto')) = 'separado'
          AND jsonb_typeof(NEW.dados_pagamento->'planos'->'separado') = 'array' THEN
      -- 2026-09-17: cobrança separada por produto caía no fallback e virava UMA
      -- parcela com o total à vista. Agora gera as parcelas de cada produto.
      v_separado := true;
    ELSIF v_opcoes IS NOT NULL AND jsonb_typeof(v_opcoes) = 'array' THEN
      SELECT o INTO v_opcao FROM jsonb_array_elements(v_opcoes) o
      WHERE (o->>'parcelas')::integer = v_parcelas LIMIT 1;
    END IF;

    IF v_separado THEN
      FOR v_plano IN SELECT * FROM jsonb_array_elements(NEW.dados_pagamento->'planos'->'separado') LOOP
        v_prod_nome := COALESCE(v_plano->'por_produto'->0->>'nome', 'Item');
        SELECT e INTO v_esc
        FROM jsonb_array_elements(COALESCE(v_forma->'por_produto', '[]'::jsonb)) e
        WHERE e->>'produto_id' = v_plano->'por_produto'->0->>'produto_id' LIMIT 1;

        v_opcao := NULL;
        IF lower(COALESCE(v_esc->>'modo','avista')) = 'parcelado' AND jsonb_typeof(v_plano->'opcoes') = 'array' THEN
          SELECT o INTO v_opcao FROM jsonb_array_elements(v_plano->'opcoes') o
          WHERE (o->>'parcelas')::integer = COALESCE(NULLIF(v_esc->>'parcelas','')::integer, (v_plano->>'max_parcelas')::integer, 1)
          LIMIT 1;
        END IF;

        IF v_opcao IS NOT NULL THEN
          v_entrada := COALESCE((v_opcao->>'entrada_centavos')::numeric, 0) / 100;
          v_parcelas := GREATEST(1, COALESCE((v_opcao->>'parcelas')::integer, 1));
          v_valor_parcela := COALESCE((v_opcao->>'valor_parcela_centavos')::numeric, 0) / 100;
        ELSE
          v_entrada := 0;
          v_parcelas := 1;
          v_valor_parcela := COALESCE((v_plano->>'total_centavos')::numeric, 0) / 100;
        END IF;

        IF v_entrada > 0 THEN
          INSERT INTO public.contas_a_receber (tenant_id, contrato_id, lead_id, numero_parcela, descricao, valor, vencimento)
          VALUES (NEW.tenant_id, NEW.id, NEW.lead_id, v_seq, 'Entrada · ' || v_prod_nome || ' · ' || v_desc_base, v_entrada, CURRENT_DATE);
          v_seq := v_seq + 1;
        END IF;
        IF v_valor_parcela > 0 THEN
          FOR i IN 1..v_parcelas LOOP
            INSERT INTO public.contas_a_receber (tenant_id, contrato_id, lead_id, numero_parcela, descricao, valor, vencimento)
            VALUES (NEW.tenant_id, NEW.id, NEW.lead_id, v_seq,
              'Parcela ' || i || '/' || v_parcelas || ' · ' || v_prod_nome || ' · ' || v_desc_base,
              v_valor_parcela, CURRENT_DATE + (i * 30));
            v_seq := v_seq + 1;
          END LOOP;
        END IF;
      END LOOP;
      RETURN NEW;
    END IF;

    IF v_opcao IS NOT NULL THEN
      v_entrada := COALESCE((v_opcao->>'entrada_centavos')::numeric, 0) / 100;
      v_valor_parcela := COALESCE((v_opcao->>'valor_parcela_centavos')::numeric, 0) / 100;
    ELSE
      -- fallback: total à vista como recebível único
      v_entrada := 0;
      v_parcelas := 1;
      v_valor_parcela := COALESCE(
        (NEW.dados_pagamento->'planos'->'junto'->>'total_centavos')::numeric / 100,
        (NEW.dados_pagamento->>'total_avista')::numeric,
        0
      );
    END IF;

    IF v_entrada > 0 THEN
      INSERT INTO public.contas_a_receber (tenant_id, contrato_id, lead_id, numero_parcela, descricao, valor, vencimento)
      VALUES (NEW.tenant_id, NEW.id, NEW.lead_id, 0, 'Entrada · ' || v_desc_base, v_entrada, CURRENT_DATE);
    END IF;

    IF v_valor_parcela > 0 THEN
      -- 2026-09-17: o plano joga o resto da divisão em `primeira_parcela_centavos`,
      -- mas aqui todas as parcelas saíam iguais — a soma ficava até n-1 centavos
      -- abaixo do total. A 1ª parcela agora usa o valor cheio quando existe.
      v_primeira := COALESCE((v_opcao->>'primeira_parcela_centavos')::numeric / 100, v_valor_parcela);
      FOR i IN 1..v_parcelas LOOP
        INSERT INTO public.contas_a_receber (tenant_id, contrato_id, lead_id, numero_parcela, descricao, valor, vencimento)
        VALUES (
          NEW.tenant_id, NEW.id, NEW.lead_id, i,
          'Parcela ' || i || '/' || v_parcelas || ' · ' || v_desc_base,
          CASE WHEN i = 1 THEN v_primeira ELSE v_valor_parcela END,
          CURRENT_DATE + (i * 30)
        );
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- 2026-09-17: antes só avisava no log do Postgres — o contrato ficava
    -- assinado e SEM cobrança, e ninguém sabia. Agora também cai no painel do
    -- dono. Continua sem re-lançar: falha aqui não pode desfazer a assinatura.
    RAISE WARNING 'gerar_recebiveis_do_contrato falhou pro contrato %: %', NEW.id, SQLERRM;
    BEGIN
      INSERT INTO public.notificacoes (user_id, tipo, icone, titulo, mensagem, acao, acao_label)
      VALUES (NEW.tenant_id, 'recebivel_falhou', 'alert',
              'Contrato assinado sem cobrança gerada',
              'O contrato "' || COALESCE(NULLIF(NEW.titulo, ''), 'Contrato')
                || '" foi assinado, mas as contas a receber não foram geradas. Lance a cobrança à mão no Financeiro. (motivo técnico: '
                || SQLERRM || ')',
              'financeiro', 'Abrir financeiro');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  RETURN NEW;
END;
$function$

