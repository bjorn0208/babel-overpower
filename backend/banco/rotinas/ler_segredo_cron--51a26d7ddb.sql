CREATE OR REPLACE FUNCTION public.ler_segredo_cron()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1
$function$

