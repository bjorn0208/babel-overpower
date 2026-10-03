CREATE OR REPLACE FUNCTION public.gestao_perfis(p_ids uuid[])
 RETURNS TABLE(id uuid, nome text, avatar_url text, dono boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.full_name, p.avatar_url, (p.system_role = 'platform_admin')
    from public.profiles p
   where p.deleted_at is null and p.id = any (p_ids)
     and (p.id = (select auth.uid()) or public.gestao_eh_admin()) $function$

