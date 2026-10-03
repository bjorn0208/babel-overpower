CREATE OR REPLACE FUNCTION public._cronjob_montar_command(p_edge_function text, p_parametros jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT format(
    $cmd$
        SELECT net.http_post(
          url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/%s',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
          ),
          body := %L::jsonb
        ) AS request_id;
    $cmd$,
    p_edge_function,
    coalesce(p_parametros, '{}'::jsonb)::text
  );
$function$

