-- Ajuste da regra (Theus: nunca apenas uma forma): no contrato manual o teto do
-- leque é no mínimo 5 (à vista + 2..5x), mesmo com template configurado parcelas=1.
-- Template com mais parcelas expande além de 5.
CREATE OR REPLACE FUNCTION public.contrato_manual_item_sintetico(
  p_nome text, p_total numeric, p_entrada numeric, p_parcelas int, p_valor_parc numeric
) RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_array(jsonb_build_object(
    'produto_id', NULL,
    'nome', COALESCE(NULLIF(p_nome, ''), 'Contrato'),
    'qtd', 1,
    'preco_centavos', round(p_total * 100)::bigint,
    'entrada_centavos', round(COALESCE(p_entrada, 0) * 100)::bigint,
    'max_parcelas', GREATEST(COALESCE(p_parcelas, 5), 5),
    'valor_parcela_cravado_centavos',
      CASE WHEN p_valor_parc IS NULL THEN NULL ELSE round(p_valor_parc * 100)::bigint END
  ));
$$;

REVOKE EXECUTE ON FUNCTION public.contrato_manual_item_sintetico(text, numeric, numeric, int, numeric) FROM PUBLIC, anon;
;
