CREATE OR REPLACE FUNCTION public.definir_memoria_lead_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END;
$function$

