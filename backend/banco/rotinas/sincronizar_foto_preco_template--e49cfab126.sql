CREATE OR REPLACE FUNCTION public.sincronizar_foto_preco_template()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_p RECORD;
BEGIN
  IF NEW.produto_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.preco_centavos, p.entrada_centavos, p.max_parcelas, p.valor_parcela_cravado_centavos
    INTO v_p
  FROM public.produtos p
  WHERE p.id = NEW.produto_id AND COALESCE(p.preco_centavos, 0) > 0;

  IF NOT FOUND THEN
    RETURN NEW; -- produto sem preço cravado: foto do template continua valendo
  END IF;

  NEW.valor_a_vista := round(v_p.preco_centavos::numeric / 100, 2);

  IF COALESCE(v_p.max_parcelas, 0) > 0 AND COALESCE(v_p.valor_parcela_cravado_centavos, 0) > 0 THEN
    NEW.opcoes_parcelamento := jsonb_build_array(jsonb_build_object(
      'parcelas',      v_p.max_parcelas,
      'entrada',       round(COALESCE(v_p.entrada_centavos, 0)::numeric / 100, 2),
      'valor_parcela', round(v_p.valor_parcela_cravado_centavos::numeric / 100, 2),
      'valor_total',   round((COALESCE(v_p.entrada_centavos, 0)
                        + v_p.max_parcelas * v_p.valor_parcela_cravado_centavos)::numeric / 100, 2)
    ));
  END IF;

  -- Construtor coerente: elementos de produtos_aceitos do mesmo produto
  -- ganham o preço vivo também.
  IF NEW.produtos_aceitos IS NOT NULL AND jsonb_typeof(NEW.produtos_aceitos) = 'array' THEN
    SELECT jsonb_agg(
      CASE WHEN (e ->> 'produto_id') = NEW.produto_id::text THEN
        e || jsonb_build_object(
          'preco_avista', round(v_p.preco_centavos::numeric / 100, 2),
          'preco_pendente', false,
          'parcelamento', jsonb_build_object(
            'entrada',               round(COALESCE(v_p.entrada_centavos, 0)::numeric / 100, 2),
            'max_parcelas',          COALESCE(v_p.max_parcelas, 0),
            'total_parcelado',       0,
            'valor_parcelado_total', round((COALESCE(v_p.entrada_centavos, 0)
                                      + COALESCE(v_p.max_parcelas, 0) * COALESCE(v_p.valor_parcela_cravado_centavos, 0))::numeric / 100, 2)
          )
        )
      ELSE e END
      ORDER BY ord)
      INTO NEW.produtos_aceitos
    FROM jsonb_array_elements(NEW.produtos_aceitos) WITH ORDINALITY AS t(e, ord);
  END IF;

  RETURN NEW;
END;
$function$

