CREATE OR REPLACE FUNCTION public.fn_obter_cargos_demo()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
    FROM vault.decrypted_secrets
   WHERE name = 'RAGENTIC_CARGOS_DEMO_NOMES'
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.fn_obter_cargos_demo() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_obter_cargos_demo() TO service_role;
;
