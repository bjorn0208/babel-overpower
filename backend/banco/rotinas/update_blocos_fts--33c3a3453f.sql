CREATE OR REPLACE FUNCTION public.update_blocos_fts(p_agent_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE blocos_conhecimento SET fts = to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(content, '')) WHERE agente_id = p_agent_id;
$function$

