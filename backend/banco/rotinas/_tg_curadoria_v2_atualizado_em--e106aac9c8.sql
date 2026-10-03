CREATE OR REPLACE FUNCTION public._tg_curadoria_v2_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$function$

