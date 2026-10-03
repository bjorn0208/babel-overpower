CREATE OR REPLACE FUNCTION public.obter_segredo_vault(p_nome text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select decrypted_secret from vault.decrypted_secrets where name = p_nome;
$function$

