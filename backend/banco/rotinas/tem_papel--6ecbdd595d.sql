CREATE OR REPLACE FUNCTION public.tem_papel(_user_id uuid, _papel text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_papel);
$function$

