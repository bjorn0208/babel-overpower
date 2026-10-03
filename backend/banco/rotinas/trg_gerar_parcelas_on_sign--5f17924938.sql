CREATE OR REPLACE FUNCTION public.trg_gerar_parcelas_on_sign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.signed_at IS NOT NULL
     AND (OLD.signed_at IS NULL OR OLD.signed_at IS DISTINCT FROM NEW.signed_at)
  THEN
    PERFORM public.fn_gerar_parcelas_contrato(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$

