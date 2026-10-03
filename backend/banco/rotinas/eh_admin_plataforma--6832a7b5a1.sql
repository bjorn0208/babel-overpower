CREATE OR REPLACE FUNCTION public.eh_admin_plataforma()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (select auth.uid()) AND system_role = 'platform_admin'
  );
$function$

