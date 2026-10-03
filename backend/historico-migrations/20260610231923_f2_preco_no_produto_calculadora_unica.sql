-- F2 (blueprint v3 §2, corte 2a) — fonte única do dinheiro.

-- 1) Produto = dono do preço (colunas aditivas, inertes até a RPC v4 ler).
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS preco_centavos   bigint CHECK (preco_centavos >= 0),
  ADD COLUMN IF NOT EXISTS entrada_centavos bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_parcelas     int    NOT NULL DEFAULT 1 CHECK (max_parcelas >= 1);

-- 2) Calculadora única (DEC-042): mesma função pra "junto" (1 chamada, todos os itens)
--    e "separado" (N chamadas, 1 por produto). Centavos bigint, resto na 1ª parcela,
--    COALESCE em toda ponta — valor de parcela NUNCA null.
CREATE OR REPLACE FUNCTION public.calcular_plano_pagamento(p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total    bigint := 0;
  v_entrada  bigint := 0;
  v_teto     int    := NULL;
  v_parcelas jsonb  := '[]'::jsonb;
  v_item     jsonb;
  v_qtd      int;
  v_preco    bigint;
  v_n        int;
  v_base     bigint;
  v_resto    bigint;
  v_por_prod jsonb := '[]'::jsonb;
BEGIN
  -- p_itens = [{produto_id, nome?, qtd, preco_centavos, entrada_centavos, max_parcelas}]
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'calcular_plano_pagamento: lista de itens vazia';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_qtd   := GREATEST(1, COALESCE((v_item->>'qtd')::int, 1));
    v_preco := COALESCE((v_item->>'preco_centavos')::bigint, 0);
    IF v_preco <= 0 THEN
      RAISE EXCEPTION 'calcular_plano_pagamento: item % sem preco_centavos válido', COALESCE(v_item->>'nome', v_item->>'produto_id');
    END IF;
    v_total   := v_total + (v_qtd * v_preco);
    v_entrada := v_entrada + COALESCE((v_item->>'entrada_centavos')::bigint, 0);
    -- teto = MIN(max_parcelas): o produto mais restritivo manda no pacote
    v_teto := LEAST(COALESCE(v_teto, 2147483647), GREATEST(1, COALESCE((v_item->>'max_parcelas')::int, 1)));
    v_por_prod := v_por_prod || jsonb_build_object(
      'produto_id', v_item->>'produto_id',
      'nome', v_item->>'nome',
      'qtd', v_qtd,
      'preco_centavos', v_preco,
      'subtotal_centavos', v_qtd * v_preco
    );
  END LOOP;

  v_teto := COALESCE(v_teto, 1);
  v_entrada := LEAST(v_entrada, v_total); -- entrada nunca maior que o total

  -- Parcelas: (total - entrada) / n truncado; resto vai pra 1ª parcela.
  FOR v_n IN 1..v_teto LOOP
    v_base  := (v_total - v_entrada) / v_n;
    v_resto := (v_total - v_entrada) - (v_base * v_n);
    v_parcelas := v_parcelas || jsonb_build_object(
      'parcelas', v_n,
      'valor_parcela_centavos', v_base,
      'primeira_parcela_centavos', v_base + v_resto,
      'entrada_centavos', v_entrada,
      'total_centavos', v_total
    );
  END LOOP;

  RETURN jsonb_build_object(
    'total_centavos', v_total,
    'entrada_centavos', v_entrada,
    'max_parcelas', v_teto,
    'opcoes', v_parcelas,
    'por_produto', v_por_prod,
    'versao_funcao', 'v1-2026-06-10',
    'entradas_calculo', p_itens
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calcular_plano_pagamento(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_plano_pagamento(jsonb) TO service_role, authenticated;
;
