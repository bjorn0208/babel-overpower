CREATE OR REPLACE FUNCTION public.gestao_tem_papel(p_papeis text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.system_role = 'platform_admin' and p.deleted_at is null)
    or exists (select 1 from public.gestao_acessos a
               where a.id = (select auth.uid()) and a.deleted_at is null and (a.papeis && p_papeis or a.papeis @> array['admin']::text[])),
    false) $function$

