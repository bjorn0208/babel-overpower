CREATE OR REPLACE FUNCTION public.resumo_cliente(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_contratos jsonb;
  v_total_consumido numeric;
  v_total_pago numeric;
  v_total_pendente numeric;
  v_proxima_parcela jsonb;
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(c ORDER BY assinado_em DESC NULLS LAST), '[]'::jsonb)
    INTO v_contratos
  FROM (
    SELECT id, titulo, status, assinado_em,
           COALESCE((opcoes_pagamento->>'valor_a_vista')::numeric, 0) AS valor
      FROM public.contratos
     WHERE lead_id = p_lead_id
       AND assinado_em IS NOT NULL
  ) c;

  SELECT COALESCE(SUM(valor), 0)
    INTO v_total_consumido
    FROM public.pagamentos_cliente
   WHERE lead_id = p_lead_id;

  SELECT COALESCE(SUM(valor) FILTER (WHERE status = 'pago'), 0),
         COALESCE(SUM(valor) FILTER (WHERE status = 'pendente'), 0)
    INTO v_total_pago, v_total_pendente
    FROM public.pagamentos_cliente
   WHERE lead_id = p_lead_id;

  SELECT to_jsonb(p)
    INTO v_proxima_parcela
  FROM (
    SELECT id, descricao, valor, data_vencimento
      FROM public.pagamentos_cliente
     WHERE lead_id = p_lead_id
       AND status = 'pendente'
     ORDER BY data_vencimento NULLS LAST
     LIMIT 1
  ) p;

  RETURN jsonb_build_object(
    'contratos', v_contratos,
    'total_consumido', v_total_consumido,
    'total_pago', v_total_pago,
    'total_pendente', v_total_pendente,
    'proxima_parcela', v_proxima_parcela
  );
END;
$function$

