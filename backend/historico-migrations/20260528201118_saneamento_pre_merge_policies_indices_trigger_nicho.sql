-- Saneamento pré-merge 2026-05-28 16:00 BRT.
-- (1) policy admin orcamento_porteiro_diario
-- (2) 11 policies recriadas com (select auth.uid()) em impersonation_log/preferencias_ui_usuario/notificacoes
-- (3) drop constraint UNIQUE legacy llm_providers_slug_key em provedores_llm
-- (4) trigger herdar_nicho_id_do_parent em profiles

-- (1)
DROP POLICY IF EXISTS orcamento_porteiro_admin_all ON public.orcamento_porteiro_diario;
CREATE POLICY orcamento_porteiro_admin_all ON public.orcamento_porteiro_diario
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role IN ('admin','platform_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role IN ('admin','platform_admin')));

-- (2a) impersonation_log
DROP POLICY IF EXISTS "Apenas admins atualizam impersonation_log" ON public.impersonation_log;
DROP POLICY IF EXISTS "Apenas admins inserem impersonation_log" ON public.impersonation_log;
DROP POLICY IF EXISTS "Apenas admins leem impersonation_log" ON public.impersonation_log;
CREATE POLICY "Apenas admins leem impersonation_log" ON public.impersonation_log
  FOR SELECT TO authenticated USING (public.eh_super_admin((SELECT auth.uid())));
CREATE POLICY "Apenas admins inserem impersonation_log" ON public.impersonation_log
  FOR INSERT TO authenticated WITH CHECK (public.eh_super_admin((SELECT auth.uid())));
CREATE POLICY "Apenas admins atualizam impersonation_log" ON public.impersonation_log
  FOR UPDATE TO authenticated USING (public.eh_super_admin((SELECT auth.uid())));

-- (2b) preferencias_ui_usuario
DROP POLICY IF EXISTS preferencias_ui_select_proprio ON public.preferencias_ui_usuario;
DROP POLICY IF EXISTS preferencias_ui_insert_proprio ON public.preferencias_ui_usuario;
DROP POLICY IF EXISTS preferencias_ui_update_proprio ON public.preferencias_ui_usuario;
DROP POLICY IF EXISTS preferencias_ui_delete_proprio ON public.preferencias_ui_usuario;
CREATE POLICY preferencias_ui_select_proprio ON public.preferencias_ui_usuario
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY preferencias_ui_insert_proprio ON public.preferencias_ui_usuario
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY preferencias_ui_update_proprio ON public.preferencias_ui_usuario
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY preferencias_ui_delete_proprio ON public.preferencias_ui_usuario
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- (2c) notificacoes
DROP POLICY IF EXISTS notificacoes_select_proprio ON public.notificacoes;
DROP POLICY IF EXISTS notificacoes_update_proprio ON public.notificacoes;
DROP POLICY IF EXISTS notificacoes_delete_proprio ON public.notificacoes;
DROP POLICY IF EXISTS notificacoes_insert_admin ON public.notificacoes;
CREATE POLICY notificacoes_select_proprio ON public.notificacoes
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY notificacoes_update_proprio ON public.notificacoes
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY notificacoes_delete_proprio ON public.notificacoes
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY notificacoes_insert_admin ON public.notificacoes
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role ~~* '%admin%')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND COALESCE(p.system_role, '') ~~* '%admin%')
  );

-- (3) DROP constraint UNIQUE legada (auto-dropa o índice)
ALTER TABLE public.provedores_llm DROP CONSTRAINT IF EXISTS llm_providers_slug_key;

-- (4) Trigger herdar nicho_id de parent em profiles (membros de equipe).
CREATE OR REPLACE FUNCTION public.herdar_nicho_id_do_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.parent_user_id IS NOT NULL THEN
    SELECT nicho_id INTO NEW.nicho_id
      FROM public.profiles
     WHERE id = NEW.parent_user_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.herdar_nicho_id_do_parent() FROM authenticated, anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_herdar_nicho_id_do_parent ON public.profiles;
CREATE TRIGGER trg_herdar_nicho_id_do_parent
  BEFORE INSERT OR UPDATE OF parent_user_id, nicho_id
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.herdar_nicho_id_do_parent();
;
