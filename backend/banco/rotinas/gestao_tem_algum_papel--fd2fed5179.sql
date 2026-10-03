CREATE OR REPLACE FUNCTION public.gestao_tem_algum_papel()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.system_role = 'platform_admin' and p.deleted_at is null)
    or exists (select 1 from public.gestao_acessos a where a.id = (select auth.uid()) and a.deleted_at is null and cardinality(a.papeis) > 0),
    false) $function$

