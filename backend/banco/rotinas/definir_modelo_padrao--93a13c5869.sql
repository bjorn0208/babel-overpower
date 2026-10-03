CREATE OR REPLACE FUNCTION public.definir_modelo_padrao(p_modelo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.eh_admin_plataforma() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  UPDATE public.modelos_llm SET is_default = false WHERE is_default = true;
  UPDATE public.modelos_llm SET is_default = true, is_active = true WHERE id = p_modelo_id;
END;
$function$

