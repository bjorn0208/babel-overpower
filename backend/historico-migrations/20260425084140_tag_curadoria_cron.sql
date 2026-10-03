-- 1) Tabela singleton de config
CREATE TABLE IF NOT EXISTS public.tag_curadoria_config (
  id smallint PRIMARY KEY DEFAULT 1,
  intervalo_horas integer NOT NULL DEFAULT 3 CHECK (intervalo_horas BETWEEN 1 AND 24),
  last_run_at timestamptz,
  next_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tag_curadoria_config_singleton CHECK (id = 1)
);

INSERT INTO public.tag_curadoria_config (id, intervalo_horas)
VALUES (1, 3)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.tag_curadoria_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tag_curadoria_config_admin_all ON public.tag_curadoria_config;
CREATE POLICY tag_curadoria_config_admin_all ON public.tag_curadoria_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));

-- 2) RPC pra reagendar cron quando admin muda intervalo
CREATE OR REPLACE FUNCTION public.set_tag_curadoria_intervalo(p_horas integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  UPDATE public.tag_curadoria_config
  SET intervalo_horas = p_horas, updated_at = now()
  WHERE id = 1;

  -- Reagenda o cron job (formato: '0 */N * * *' a cada N horas)
  v_cron_expr := format('0 */%s * * *', p_horas);

  PERFORM cron.alter_job(
    job_id := (SELECT jobid FROM cron.job WHERE jobname = 'tag_curadoria_run'),
    schedule := v_cron_expr
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tag_curadoria_intervalo(integer) TO authenticated;

-- 3) Cron job que chama a edge function
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tag_curadoria_run') THEN
    PERFORM cron.unschedule('tag_curadoria_run');
  END IF;

  PERFORM cron.schedule(
    'tag_curadoria_run',
    '0 */3 * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-tags-curadoria',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 300000
    )
    WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key');
    $cron$
  );
END $$;
;
