CREATE OR REPLACE FUNCTION public.obter_meu_usuario_pai_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT parent_user_id FROM public.profiles WHERE id = auth.uid();
$function$

