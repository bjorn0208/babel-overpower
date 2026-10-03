CREATE OR REPLACE FUNCTION public.fn_rate_limit_limpar()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DELETE FROM public.rate_limit_tenant WHERE janela < now() - interval '1 hour'; $function$

