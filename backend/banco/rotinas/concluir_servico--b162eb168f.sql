CREATE OR REPLACE FUNCTION public.concluir_servico(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.leads
     SET location = 'base',
         fase_cliente = 'concluido',
         updated_at = now()
   WHERE id = p_lead_id AND deleted_at IS NULL;
END;
$function$

