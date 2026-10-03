-- v4 (regra do Theus 2026-08-10): link de contrato SEMPRE oferece todas as formas
-- de pagar (à vista + 2..max_parcelas). parcelas_oferecidas deixa de FILTRAR o
-- leque — segue existindo só como config da parcela promocional (cravada no teto).
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
  IF v_qtd_itens > 1 THEN v_cravado := NULL; END IF;

  -- v4: leque completo SEMPRE (1..teto) — nunca uma opção só.
  FOR v_n IN 1..v_teto LOOP
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
    'versao_funcao', 'v4-2026-08-10',
    'entradas_calculo', p_itens
  );
END;
$function$;
;
