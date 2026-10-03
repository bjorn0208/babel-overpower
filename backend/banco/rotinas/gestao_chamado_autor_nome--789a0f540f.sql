CREATE OR REPLACE FUNCTION public.gestao_chamado_autor_nome()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    nullif(btrim((select a.pessoa from public.gestao_acessos a where a.id = (select auth.uid()) and a.deleted_at is null)), ''),
    nullif(btrim((select p.full_name from public.profiles p where p.id = (select auth.uid()))), ''),
    'sem nome') $function$

