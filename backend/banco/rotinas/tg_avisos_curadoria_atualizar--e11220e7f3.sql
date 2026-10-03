CREATE OR REPLACE FUNCTION public.tg_avisos_curadoria_atualizar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$function$

