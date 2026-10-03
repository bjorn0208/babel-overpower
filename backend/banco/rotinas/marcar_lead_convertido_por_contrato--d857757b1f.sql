CREATE OR REPLACE FUNCTION public.marcar_lead_convertido_por_contrato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_valor numeric;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(ci.subtotal), 0) INTO v_valor
  FROM public.contrato_itens ci
  WHERE ci.contrato_id = NEW.id;

  UPDATE public.leads l
  SET desfecho = 'convertido',
      desfecho_em = COALESCE(NEW.assinado_em, now()),
      desfecho_motivo = 'contrato assinado',
      valor_conversao = COALESCE(NULLIF(v_valor, 0), l.valor_conversao)
  WHERE l.id = NEW.lead_id
    AND l.desfecho IS DISTINCT FROM 'convertido';

  RETURN NEW;
END;
$function$

