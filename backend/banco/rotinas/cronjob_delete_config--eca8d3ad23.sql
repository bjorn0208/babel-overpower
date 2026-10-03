CREATE OR REPLACE FUNCTION public.cronjob_delete_config(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_jobid int;
BEGIN
  IF NOT public._eh_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform_admin pode gerenciar cronjobs';
  END IF;

  SELECT jobid_pg_cron INTO v_jobid FROM public.agendamentos_config WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_jobid IS NOT NULL THEN
    BEGIN
      PERFORM cron.unschedule(v_jobid);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  DELETE FROM public.agendamentos_config WHERE id = p_id;
  RETURN true;
END;
$function$

