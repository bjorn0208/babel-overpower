CREATE OR REPLACE FUNCTION public.fn_tags_do_texto(p_texto text)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(tag order by tag), '{}')
  from public.mentor_tag_regras
  where p_texto ~* padrao
$function$

