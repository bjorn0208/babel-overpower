CREATE OR REPLACE FUNCTION public.excluir_campo_personalizado(p_lead_id uuid, p_chave text)
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
     SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) - p_chave,
         updated_at = now()
   WHERE id = p_lead_id;
END;
$function$

