CREATE OR REPLACE FUNCTION public.retentar_acoes_agendadas_falhas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status IN ('failed','falhou') AND COALESCE(NEW.tentativas, 0) < 3 THEN
    NEW.scheduled_at := now() + interval '5 minutes';
    NEW.status := 'pendente';
    NEW.tentativas := COALESCE(OLD.tentativas, 0) + 1;
  END IF;
  RETURN NEW;
END;
$function$

