CREATE OR REPLACE FUNCTION public.contrato_manual_item_sintetico(p_nome text, p_total numeric, p_entrada numeric, p_parcelas integer, p_valor_parc numeric)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_array(
    jsonb_build_object(
      'produto_id', NULL,
      'nome', COALESCE(NULLIF(p_nome, ''), 'Contrato'),
      'qtd', 1,
      'preco_centavos', round(p_total * 100)::bigint,
      'entrada_centavos', round(COALESCE(p_entrada, 0) * 100)::bigint,
      -- Plano cravado usa o nº de parcelas do próprio template; sem cravo, mantém o
      -- piso 5 da regra de 2026-08-10.
      'max_parcelas',
        CASE
          WHEN p_valor_parc IS NOT NULL AND p_valor_parc > 0 AND COALESCE(p_parcelas, 0) > 0
            THEN p_parcelas
          ELSE GREATEST(COALESCE(p_parcelas, 5), 5)
        END,
      'valor_parcela_cravado_centavos',
        CASE WHEN p_valor_parc IS NULL THEN NULL ELSE round(p_valor_parc * 100)::bigint END
    )
    -- Δ 2026-09-08: com valor de parcela cravado, declara a oferta explícita — é o
    -- mesmo campo que o caminho do agente já manda, e faz `calcular_plano_pagamento`
    -- devolver só esse plano em vez de abrir o leque.
    || CASE
         WHEN p_valor_parc IS NOT NULL AND p_valor_parc > 0 AND COALESCE(p_parcelas, 0) > 0
           THEN jsonb_build_object('parcelas_oferecidas', jsonb_build_array(p_parcelas))
         ELSE '{}'::jsonb
       END
  );
$function$

