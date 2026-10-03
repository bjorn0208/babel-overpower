CREATE OR REPLACE FUNCTION public.sincronizar_config_cronjob()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'vault', 'extensions'
AS $function$
DECLARE
  v_url text;
  v_jobid bigint;
BEGIN
  -- Caso 1: desativando → UNSCHEDULE
  IF NEW.ativo = false AND NEW.jobid_pg_cron IS NOT NULL THEN
    BEGIN
      PERFORM cron.unschedule(NEW.jobid_pg_cron::int);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    NEW.jobid_pg_cron := NULL;
    NEW.atualizado_em := now();
    RETURN NEW;
  END IF;

  -- Caso 2: modo semantico → não cria cron.job · trigger separado processa
  IF NEW.modo = 'semantico' THEN
    IF NEW.jobid_pg_cron IS NOT NULL THEN
      BEGIN
        PERFORM cron.unschedule(NEW.jobid_pg_cron::int);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      NEW.jobid_pg_cron := NULL;
    END IF;
    NEW.atualizado_em := now();
    RETURN NEW;
  END IF;

  -- Caso 3: modo horario + ativo + edge_function → UPSERT cron.job via net.http_post
  IF NEW.modo = 'horario' AND NEW.ativo = true AND NEW.cron_expr IS NOT NULL AND NEW.edge_function IS NOT NULL THEN
    v_url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/' || NEW.edge_function;

    -- Se já tinha jobid → UNSCHEDULE primeiro (reagendar com novo cron_expr)
    IF NEW.jobid_pg_cron IS NOT NULL THEN
      BEGIN
        PERFORM cron.unschedule(NEW.jobid_pg_cron::int);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- Schedule novo invocando edge fn via net.http_post
    SELECT cron.schedule(
      NEW.nome,
      NEW.cron_expr,
      format(
        $cron$
        SELECT net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
          ),
          body := %L::jsonb
        ) AS request_id;
        $cron$,
        v_url,
        coalesce(NEW.parametros::text, '{}')
      )
    ) INTO v_jobid;

    NEW.jobid_pg_cron := v_jobid::int;
  END IF;

  -- Caso 4: modo horario + ativo + sql_inline → schedule SQL direto
  IF NEW.modo = 'horario' AND NEW.ativo = true AND NEW.cron_expr IS NOT NULL AND NEW.sql_inline IS NOT NULL AND NEW.edge_function IS NULL THEN
    IF NEW.jobid_pg_cron IS NOT NULL THEN
      BEGIN
        PERFORM cron.unschedule(NEW.jobid_pg_cron::int);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    SELECT cron.schedule(
      NEW.nome,
      NEW.cron_expr,
      NEW.sql_inline
    ) INTO v_jobid;

    NEW.jobid_pg_cron := v_jobid::int;
  END IF;

  NEW.atualizado_em := now();
  RETURN NEW;
END;
$function$

