CREATE OR REPLACE FUNCTION public.gestao_eh_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.gestao_tem_papel(array['admin']::text[]) $function$

