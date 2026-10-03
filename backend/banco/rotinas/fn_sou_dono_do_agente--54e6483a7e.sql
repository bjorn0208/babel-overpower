CREATE OR REPLACE FUNCTION public.fn_sou_dono_do_agente(p_agente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.agentes a
    where a.id = p_agente and a.user_id = (select auth.uid())
  )
$function$

