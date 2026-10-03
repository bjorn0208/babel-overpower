CREATE OR REPLACE FUNCTION public.definir_campo_customizado(p_lead_id uuid, p_chave text, p_valor text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_chave IS NULL OR length(trim(p_chave)) = 0 THEN
    RAISE EXCEPTION 'chave_invalida';
  END IF;

  UPDATE public.leads
     SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object(p_chave, p_valor),
         updated_at = now()
   WHERE id = p_lead_id;
END;
$function$

