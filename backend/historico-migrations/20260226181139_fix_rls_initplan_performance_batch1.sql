
-- ============================================================
-- MIGRATION: Fix auth_rls_initplan performance - Batch 1
-- Replace auth.uid() with (select auth.uid()) in all policies
-- ============================================================

-- === profiles ===
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles_select_my_team" ON public.profiles;
CREATE POLICY "profiles_select_my_team" ON public.profiles
  FOR SELECT TO authenticated
  USING (parent_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles_update_my_team" ON public.profiles;
CREATE POLICY "profiles_update_my_team" ON public.profiles
  FOR UPDATE TO authenticated
  USING (parent_user_id = (select auth.uid()))
  WITH CHECK (parent_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (is_platform_admin());

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (is_platform_admin());

-- === conversations ===
DROP POLICY IF EXISTS "user_read_tenant_conversations" ON public.conversations;
CREATE POLICY "user_read_tenant_conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    tenant_id = (select auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM profiles
      WHERE id = (select auth.uid()) AND parent_user_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "user_update_own_conversations" ON public.conversations;
CREATE POLICY "user_update_own_conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (select auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM profiles
      WHERE id = (select auth.uid()) AND parent_user_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "user_read_conversations" ON public.conversations;
CREATE POLICY "user_read_conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    phone ~~ 'chat-test-%'
    AND EXISTS (
      SELECT 1 FROM user_agents ua
      WHERE conversations.phone ~~ ('chat-test-' || ua.template_id || '%')
      AND (ua.user_id = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = (select auth.uid())
          AND profiles.parent_user_id = ua.user_id
        )
      )
    )
  );

-- === messages ===
DROP POLICY IF EXISTS "user_read_own_messages" ON public.messages;
CREATE POLICY "user_read_own_messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.tenant_id = (select auth.uid())
        OR c.tenant_id IN (
          SELECT parent_user_id FROM profiles
          WHERE id = (select auth.uid()) AND parent_user_id IS NOT NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS "user_read_messages" ON public.messages;
CREATE POLICY "user_read_messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN user_agents ua ON c.phone ~~ ('chat-test-' || ua.template_id || '%')
      WHERE c.id = messages.conversation_id
      AND (
        ua.user_id = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = (select auth.uid())
          AND profiles.parent_user_id = ua.user_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "user_insert_own_messages" ON public.messages;
CREATE POLICY "user_insert_own_messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.tenant_id = (select auth.uid())
        OR c.tenant_id IN (
          SELECT parent_user_id FROM profiles
          WHERE id = (select auth.uid()) AND parent_user_id IS NOT NULL
        )
      )
    )
  );

-- === leads ===
DROP POLICY IF EXISTS "user_read_own_leads" ON public.leads;
CREATE POLICY "user_read_own_leads" ON public.leads
  FOR SELECT TO authenticated
  USING (
    tenant_id = (select auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM profiles
      WHERE id = (select auth.uid()) AND parent_user_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "user_update_own_leads" ON public.leads;
CREATE POLICY "user_update_own_leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (select auth.uid())
    OR tenant_id IN (
      SELECT parent_user_id FROM profiles
      WHERE id = (select auth.uid()) AND parent_user_id IS NOT NULL
    )
  );

;
