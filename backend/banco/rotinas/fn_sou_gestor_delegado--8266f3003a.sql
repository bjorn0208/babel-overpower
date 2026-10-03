CREATE OR REPLACE FUNCTION public.fn_sou_gestor_delegado(p_agente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.agentes_delegados d
    where d.agente_id = p_agente and d.gestor_user_id = (select auth.uid())
  )
$function$

