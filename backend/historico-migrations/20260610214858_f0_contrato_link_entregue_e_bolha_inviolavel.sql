-- F0 (blueprint v3 §4/§7): confirmação de entrega do link + bolha inviolável fura o barge-in.

-- 1) Carimbo de entrega do link do contrato (marcado pelo outbox-consumer ao despachar).
ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS link_entregue_em timestamptz;

-- 2) Barge-in (substituir pendentes) NUNCA cancela bolha marcada inviolavel
--    (bolha-do-link de contrato — entrega determinística, lead pediu o contrato).
CREATE OR REPLACE FUNCTION public.substituir_caixa_saida_pendentes(p_conversation_id uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.caixa_saida_mensagens SET status = 'substituida', updated_at = now()
  WHERE conversation_id = p_conversation_id
    AND status IN ('pending','pendente')
    AND (p_since IS NULL OR created_at < p_since)
    AND COALESCE(carga->>'inviolavel','') <> 'true';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
;
