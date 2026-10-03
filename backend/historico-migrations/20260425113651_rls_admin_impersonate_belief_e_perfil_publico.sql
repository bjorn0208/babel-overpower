-- Padroniza policies pra liberar admin em modo impersonate (mesmo padrão de lead_memory)

-- conversation_belief
DROP POLICY IF EXISTS conversation_belief_tenant_all ON public.conversation_belief;
CREATE POLICY conversation_belief_tenant_all ON public.conversation_belief
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT auth.uid()) OR public.is_platform_admin())
  WITH CHECK (tenant_id = (SELECT auth.uid()) OR public.is_platform_admin());

-- public_profile
DROP POLICY IF EXISTS owner_all_public_profile ON public.public_profile;
CREATE POLICY owner_all_public_profile ON public.public_profile
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_platform_admin())
  WITH CHECK ((SELECT auth.uid()) = user_id OR public.is_platform_admin());

-- public_services
DROP POLICY IF EXISTS owner_all_public_services ON public.public_services;
CREATE POLICY owner_all_public_services ON public.public_services
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_platform_admin())
  WITH CHECK ((SELECT auth.uid()) = user_id OR public.is_platform_admin());

-- public_gallery
DROP POLICY IF EXISTS owner_all_public_gallery ON public.public_gallery;
CREATE POLICY owner_all_public_gallery ON public.public_gallery
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_platform_admin())
  WITH CHECK ((SELECT auth.uid()) = user_id OR public.is_platform_admin());

-- public_testimonials
DROP POLICY IF EXISTS owner_all_public_testimonials ON public.public_testimonials;
CREATE POLICY owner_all_public_testimonials ON public.public_testimonials
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_platform_admin())
  WITH CHECK ((SELECT auth.uid()) = user_id OR public.is_platform_admin());

-- public_chat_sessions (somente SELECT — escrita é via edge service_role)
DROP POLICY IF EXISTS owner_select_sessions ON public.public_chat_sessions;
CREATE POLICY owner_select_sessions ON public.public_chat_sessions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_platform_admin());

-- public_profile_events (somente SELECT — escrita é via edge service_role)
DROP POLICY IF EXISTS owner_select_events ON public.public_profile_events;
CREATE POLICY owner_select_events ON public.public_profile_events
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_platform_admin());
;
