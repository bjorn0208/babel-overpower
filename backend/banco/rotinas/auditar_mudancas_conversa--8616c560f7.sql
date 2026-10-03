CREATE OR REPLACE FUNCTION public.auditar_mudancas_conversa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.agent_enabled IS DISTINCT FROM NEW.agent_enabled
     OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.auditoria_conversa (
      conversation_id, old_agent_enabled, new_agent_enabled,
      old_status, new_status, changed_by, is_service_role
    ) VALUES (
      NEW.id, OLD.agent_enabled, NEW.agent_enabled,
      OLD.status, NEW.status,
      (SELECT auth.uid()),
      COALESCE(current_setting('role', true) = 'service_role', false)
    );
  END IF;
  RETURN NEW;
END;
$function$

