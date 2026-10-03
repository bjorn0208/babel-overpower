CREATE OR REPLACE FUNCTION public.obter_dono_indicacao_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(p.parent_user_id, p.id)
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
$function$

