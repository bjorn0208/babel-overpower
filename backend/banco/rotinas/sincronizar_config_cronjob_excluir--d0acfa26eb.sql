CREATE OR REPLACE FUNCTION public.sincronizar_config_cronjob_excluir()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
BEGIN
  IF OLD.jobid_pg_cron IS NOT NULL THEN
    BEGIN
      PERFORM cron.unschedule(OLD.jobid_pg_cron::int);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN OLD;
END;
$function$

