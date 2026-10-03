CREATE OR REPLACE FUNCTION public.tg_ficha_form_campos_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $function$

