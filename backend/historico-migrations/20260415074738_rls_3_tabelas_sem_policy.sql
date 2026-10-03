DROP POLICY IF EXISTS "service_role_only_pending_delivery" ON public.pending_delivery;
CREATE POLICY "service_role_only_pending_delivery" ON public.pending_delivery
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_only_pending_team_invitations" ON public.pending_team_invitations;
CREATE POLICY "service_role_only_pending_team_invitations" ON public.pending_team_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_only_typing_state" ON public.typing_state;
CREATE POLICY "service_role_only_typing_state" ON public.typing_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_read_typing_state" ON public.typing_state;
CREATE POLICY "auth_read_typing_state" ON public.typing_state
  FOR SELECT TO authenticated USING (
    conversation_id IN (
      SELECT id FROM public.conversations WHERE tenant_id = (SELECT auth.uid())
    )
  );
;
