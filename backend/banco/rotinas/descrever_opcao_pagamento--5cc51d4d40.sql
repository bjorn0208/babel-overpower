CREATE OR REPLACE FUNCTION public.descrever_opcao_pagamento(p_opcao jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  -- Texto da cláusula de pagamento para uma opção nomeada (produtos.opcoes_pagamento).
  -- Espelhado em frontend/src/pages/public/contrato/helpers.ts (descreverOpcaoNomeada) — manter iguais.
  WITH v AS (
    SELECT
      COALESCE(p_opcao->>'rotulo', 'Opção escolhida') AS rotulo,
      COALESCE((p_opcao->>'total_centavos')::numeric, 0) / 100 AS total,
      COALESCE((p_opcao->>'entrada_centavos')::numeric, 0) / 100 AS entrada,
      GREATEST(1, COALESCE((p_opcao->>'parcelas')::int, 1)) AS parcelas,
      COALESCE((p_opcao->>'valor_parcela_centavos')::numeric, 0) / 100 AS parcela,
      NULLIF(btrim(p_opcao->>'observacao'), '') AS obs
  )
  SELECT
    'Forma de pagamento escolhida: ' || rotulo
    || '. Valor total de R$ ' || replace(to_char(round(total, 2), 'FM999999990.00'), '.', ',')
    || CASE
         WHEN parcelas > 1 AND entrada > 0 THEN
           ', sendo entrada de R$ ' || replace(to_char(round(entrada, 2), 'FM999999990.00'), '.', ',')
           || ' + ' || parcelas || ' parcelas de R$ ' || replace(to_char(round(parcela, 2), 'FM999999990.00'), '.', ',')
         WHEN parcelas > 1 THEN
           ', em ' || parcelas || ' parcelas de R$ ' || replace(to_char(round(parcela, 2), 'FM999999990.00'), '.', ',')
         ELSE ', em pagamento único'
       END
    || '.'
    || COALESCE(' ' || obs, '')
  FROM v;
$function$

