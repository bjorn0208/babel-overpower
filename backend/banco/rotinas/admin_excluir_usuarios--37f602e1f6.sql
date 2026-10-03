CREATE OR REPLACE FUNCTION public.admin_excluir_usuarios(p_user_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_caller_role text; v_uid uuid; v_deleted int := 0;
BEGIN
  SELECT system_role INTO v_caller_role FROM public.profiles WHERE id = (SELECT auth.uid()) LIMIT 1;
  IF v_caller_role IS DISTINCT FROM 'platform_admin' THEN RAISE EXCEPTION 'Apenas administradores podem deletar usuarios'; END IF;
  IF (SELECT auth.uid()) = ANY(p_user_ids) THEN RAISE EXCEPTION 'Voce nao pode deletar sua propria conta'; END IF;
  DELETE FROM public.blocos_conhecimento WHERE agente_id IN (SELECT id FROM public.agentes_usuario WHERE user_id = ANY(p_user_ids));
  DELETE FROM public.leads WHERE id IN (SELECT l.id FROM public.leads l JOIN public.conversas c ON c.lead_id = l.id WHERE c.tenant_id = ANY(p_user_ids));
  DELETE FROM public.conversas WHERE tenant_id = ANY(p_user_ids);
  FOREACH v_uid IN ARRAY p_user_ids LOOP DELETE FROM auth.users WHERE id = v_uid; v_deleted := v_deleted + 1; END LOOP;
  RETURN jsonb_build_object('deleted', v_deleted);
END;
$function$

