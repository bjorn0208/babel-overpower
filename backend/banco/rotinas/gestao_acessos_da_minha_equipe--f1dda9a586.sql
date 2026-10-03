CREATE OR REPLACE FUNCTION public.gestao_acessos_da_minha_equipe()
 RETURNS TABLE(id uuid, papeis text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.id, a.papeis
    from public.gestao_acessos a
    join public.profiles m on m.id = a.id and m.deleted_at is null
   where a.deleted_at is null
     and m.parent_user_id = (select auth.uid())
     and public.gestao_eh_admin() $function$

