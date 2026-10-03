CREATE OR REPLACE FUNCTION public.gestao_buscar_perfis(p_q text)
 RETURNS TABLE(id uuid, nome text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.full_name, p.avatar_url
    from public.profiles p
   where p.deleted_at is null and public.gestao_eh_admin()
     and (coalesce(p_q,'') = '' or p.full_name ilike '%' || replace(replace(p_q,'%','\%'),'_','\_') || '%')
   order by p.full_name limit 8 $function$

