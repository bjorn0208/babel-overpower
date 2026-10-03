CREATE OR REPLACE FUNCTION public.tornar_cliente_via_base(p_lead_id uuid)
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
     SET location = 'cliente',
         converted_at = COALESCE(converted_at, now()),
         fase_cliente = COALESCE(fase_cliente, 'documentacao'),
         fase_pipeline = 'fechado',
         updated_at = now()
   WHERE id = p_lead_id AND deleted_at IS NULL;
END;
$function$

