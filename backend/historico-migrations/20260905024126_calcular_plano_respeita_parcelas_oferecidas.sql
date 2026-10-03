-- A v4 gerava o leque 1..max_parcelas SEMPRE ("leque completo SEMPRE — nunca uma opção só"),
-- ignorando produtos.parcelas_oferecidas mesmo recebendo o campo em p_itens.
--
-- Consequência no Diego (parcelas_oferecidas = [5], entrada 117, parcela cravada 147):
-- o contrato oferecia 1x/2x/3x/4x além do 5x, e as quatro extras eram calculadas dividindo o
-- valor À VISTA. O lead que escolhesse 4x pagava 117 + 4×120 = R$ 597 em vez de R$ 852 —
-- R$ 255 a menos, com prazo de parcelado. Valia pra qualquer tenant com max_parcelas > 1.
--
-- v5: quando o item traz parcelas_oferecidas não-vazio, gera SÓ esses n (dentro do teto).
-- Sem a lista, mantém o leque 1..teto de antes — nenhum tenant que não cravou oferta muda.
-- Multi-produto continua caindo no leque, mesma regra já adotada pro valor cravado: não dá
-- pra intersectar oferta de produtos diferentes sem inventar política de negócio.

CREATE OR REPLACE FUNCTION public.calcular_plano_pagamento(p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_total      bigint := 0;
  v_entrada    bigint := 0;
  v_teto       int    := NULL;
  v_parcelas   jsonb  := '[]'::jsonb;
  v_item       jsonb;
  v_qtd        int;
  v_preco      bigint;
  v_n          int;
  v_base       bigint;
  v_resto      bigint;
  v_por_prod   jsonb := '[]'::jsonb;
  v_qtd_itens  int := 0;
  v_cravado    bigint := NULL;
  v_oferecidas int[]  := NULL;
  v_lista      int[];
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'calcular_plano_pagamento: lista de itens vazia';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_qtd_itens := v_qtd_itens + 1;
    v_qtd   := GREATEST(1, COALESCE((v_item->>'qtd')::int, 1));
    v_preco := COALESCE((v_item->>'preco_centavos')::bigint, 0);
    IF v_preco <= 0 THEN
      RAISE EXCEPTION 'calcular_plano_pagamento: item % sem preco_centavos válido', COALESCE(v_item->>'nome', v_item->>'produto_id');
    END IF;
    v_total   := v_total + (v_qtd * v_preco);
    v_entrada := v_entrada + COALESCE((v_item->>'entrada_centavos')::bigint, 0);
    v_teto := LEAST(COALESCE(v_teto, 2147483647), GREATEST(1, COALESCE((v_item->>'max_parcelas')::int, 1)));
    -- cravado só vale pra pacote de 1 item (multi-produto divide — risco aceito blueprint §9)
    v_cravado := NULLIF((v_item->>'valor_parcela_cravado_centavos'), '')::bigint;

    -- v5: oferta explícita do dono do produto. Mesma restrição do cravado (1 item só).
    v_oferecidas := NULL;
    IF jsonb_typeof(v_item->'parcelas_oferecidas') = 'array'
       AND jsonb_array_length(v_item->'parcelas_oferecidas') > 0 THEN
      SELECT array_agg(x::int) INTO v_oferecidas
      FROM jsonb_array_elements_text(v_item->'parcelas_oferecidas') AS t(x);
    END IF;

    v_por_prod := v_por_prod || jsonb_build_object(
      'produto_id', v_item->>'produto_id',
      'nome', v_item->>'nome',
      'qtd', v_qtd,
      'preco_centavos', v_preco,
      'subtotal_centavos', v_qtd * v_preco
    );
  END LOOP;

  v_teto := COALESCE(v_teto, 1);
  v_entrada := LEAST(v_entrada, v_total);
  IF v_qtd_itens > 1 THEN v_cravado := NULL; v_oferecidas := NULL; END IF;

  -- quais n gerar: a oferta do dono (limitada ao teto) ou, sem ela, o leque completo
  IF v_oferecidas IS NOT NULL THEN
    SELECT array_agg(DISTINCT n ORDER BY n) INTO v_lista
    FROM unnest(v_oferecidas) AS n
    WHERE n BETWEEN 1 AND v_teto;
  END IF;
  IF v_lista IS NULL OR array_length(v_lista, 1) IS NULL THEN
    SELECT array_agg(n ORDER BY n) INTO v_lista FROM generate_series(1, v_teto) AS n;
  END IF;

  FOREACH v_n IN ARRAY v_lista LOOP
    IF v_cravado IS NOT NULL AND v_n = v_teto THEN
      -- parcela cravada pelo dono: total parcelado = entrada + n × cravado (pode ter juros embutido)
      v_parcelas := v_parcelas || jsonb_build_object(
        'parcelas', v_n,
        'valor_parcela_centavos', v_cravado,
        'primeira_parcela_centavos', v_cravado,
        'entrada_centavos', v_entrada,
        'total_centavos', v_entrada + (v_n * v_cravado),
        'origem_parcela', 'cravada'
      );
    ELSE
      v_base  := (v_total - v_entrada) / v_n;
      v_resto := (v_total - v_entrada) - (v_base * v_n);
      v_parcelas := v_parcelas || jsonb_build_object(
        'parcelas', v_n,
        'valor_parcela_centavos', v_base,
        'primeira_parcela_centavos', v_base + v_resto,
        'entrada_centavos', v_entrada,
        'total_centavos', v_total,
        'origem_parcela', 'calculada'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_centavos', v_total,
    'entrada_centavos', v_entrada,
    'max_parcelas', v_teto,
    'opcoes', v_parcelas,
    'por_produto', v_por_prod,
    'versao_funcao', 'v5-2026-09-04',
    'entradas_calculo', p_itens
  );
END;
$function$;

COMMENT ON FUNCTION public.calcular_plano_pagamento(jsonb) IS
  'Monta as opções de parcelamento do contrato. v5 (2026-09-04): respeita '
  'produtos.parcelas_oferecidas quando vier preenchido — antes gerava sempre 1..max_parcelas e '
  'as opções extras dividiam o valor à vista, cobrando menos que o parcelado real.';
;
