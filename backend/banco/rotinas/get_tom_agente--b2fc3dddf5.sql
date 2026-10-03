CREATE OR REPLACE FUNCTION public.get_tom_agente(p_user_agent_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (SELECT tom_agente FROM public.agentes_usuario WHERE id = p_user_agent_id),
    'espelhado'
  );
$function$

