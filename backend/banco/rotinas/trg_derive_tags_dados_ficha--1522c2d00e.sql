CREATE OR REPLACE FUNCTION public.trg_derive_tags_dados_ficha()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.dados_ficha IS NOT DISTINCT FROM NEW.dados_ficha THEN
    RETURN NEW;
  END IF;
  PERFORM public.derive_tags_for_lead(NEW.id);
  RETURN NEW;
END;
$function$

