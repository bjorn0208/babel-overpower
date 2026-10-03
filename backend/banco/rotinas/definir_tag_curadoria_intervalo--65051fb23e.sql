CREATE OR REPLACE FUNCTION public.definir_tag_curadoria_intervalo(p_horas integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cron_expr text;
BEGIN
  IF p_horas < 1 OR p_horas > 24 THEN
    RAISE EXCEPTION 'intervalo deve ser entre 1 e 24 horas';
  END IF;

  -- Verifica se é admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'
  ) THEN
    RAISE EXCEPTION 'apenas platform_admin pode alterar';
  END IF;

  UPDATE public.config_curadoria_tag
  SET intervalo_horas = p_horas, updated_at = now()
  WHERE id = 1;

  -- Reagenda o cron job (formato: '0 */N * * *' a cada N horas)
  v_cron_expr := format('0 */%s * * *', p_horas);

  PERFORM cron.alter_job(
    job_id := (SELECT jobid FROM cron.job WHERE jobname = 'tag_curadoria_run'),
    schedule := v_cron_expr
  );
END;
$function$

