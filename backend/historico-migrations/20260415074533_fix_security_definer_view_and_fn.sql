DROP VIEW IF EXISTS public.v_profile_health;

CREATE VIEW public.v_profile_health AS
SELECT p.id,
       p.email,
       p.full_name,
       p.parent_user_id,
       p.system_role,
       CASE
         WHEN p.parent_user_id IS NULL AND ua.user_id IS NULL THEN 'tenant_sem_agente'
         WHEN p.parent_user_id IS NOT NULL AND ua.user_id IS NOT NULL THEN 'team_com_agente_orfao'
         WHEN p.parent_user_id IS NOT NULL AND p.system_role = 'platform_admin'::text THEN 'team_como_admin'
         WHEN p.parent_user_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.profiles pp
           WHERE pp.id = p.parent_user_id AND pp.parent_user_id IS NULL
         ) THEN 'parent_invalido'
         ELSE 'ok'
       END AS status_integridade
FROM public.profiles p
LEFT JOIN public.user_agents ua ON ua.user_id = p.id;

REVOKE ALL ON public.v_profile_health FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_profile_health TO service_role;

CREATE OR REPLACE FUNCTION public.audit_conversation_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.agent_enabled IS DISTINCT FROM NEW.agent_enabled
     OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.conversation_audit (
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
$$;
;
