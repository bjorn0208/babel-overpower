CREATE OR REPLACE FUNCTION public.tg_recursos_curad_atualizado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN NEW.atualizado_em := now(); RETURN NEW; END;
$function$

