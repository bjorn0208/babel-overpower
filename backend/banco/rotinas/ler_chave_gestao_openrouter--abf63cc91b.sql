CREATE OR REPLACE FUNCTION public.ler_chave_gestao_openrouter()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'openrouter_management_key'
  LIMIT 1
$function$

