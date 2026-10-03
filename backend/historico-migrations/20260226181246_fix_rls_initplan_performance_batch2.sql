
-- ============================================================
-- MIGRATION: Fix auth_rls_initplan performance - Batch 2
-- ============================================================

-- === lead_cards ===
DROP POLICY IF EXISTS "user_read_lead_cards" ON public.lead_cards;
CREATE POLICY "user_read_lead_cards" ON public.lead_cards
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN user_agents ua ON c.phone ~~ ('chat-test-' || ua.template_id || '%')
      WHERE c.id = lead_cards.conversation_id
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

-- === channels ===
DROP POLICY IF EXISTS "admin_all_channels" ON public.channels;
CREATE POLICY "admin_all_channels" ON public.channels
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.system_role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS "user_read_own_channel" ON public.channels;
CREATE POLICY "user_read_own_channel" ON public.channels
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR user_id = (
      SELECT parent_user_id FROM profiles
      WHERE id = (select auth.uid())
    )
  );

-- === empresas ===
DROP POLICY IF EXISTS "empresas_select_own" ON public.empresas;
CREATE POLICY "empresas_select_own" ON public.empresas
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "empresas_insert_own" ON public.empresas;
CREATE POLICY "empresas_insert_own" ON public.empresas
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "empresas_update_own" ON public.empresas;
CREATE POLICY "empresas_update_own" ON public.empresas
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "empresas_delete_own" ON public.empresas;
CREATE POLICY "empresas_delete_own" ON public.empresas
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "empresas_admin_all" ON public.empresas;
CREATE POLICY "empresas_admin_all" ON public.empresas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.system_role = 'platform_admin'
    )
  );

-- === produtos ===
DROP POLICY IF EXISTS "produtos_select_own" ON public.produtos;
CREATE POLICY "produtos_select_own" ON public.produtos
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "produtos_insert_own" ON public.produtos;
CREATE POLICY "produtos_insert_own" ON public.produtos
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "produtos_update_own" ON public.produtos;
CREATE POLICY "produtos_update_own" ON public.produtos
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "produtos_delete_own" ON public.produtos;
CREATE POLICY "produtos_delete_own" ON public.produtos
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- === purchase_orders ===
DROP POLICY IF EXISTS "admin_read_purchase_orders" ON public.purchase_orders;
CREATE POLICY "admin_read_purchase_orders" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.system_role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS "admin_update_purchase_orders" ON public.purchase_orders;
CREATE POLICY "admin_update_purchase_orders" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.system_role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS "user_read_own_orders" ON public.purchase_orders;
CREATE POLICY "user_read_own_orders" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_insert_own_orders" ON public.purchase_orders;
CREATE POLICY "user_insert_own_orders" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "team_read_parent_orders" ON public.purchase_orders;
CREATE POLICY "team_read_parent_orders" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.parent_user_id = purchase_orders.user_id
    )
  );

-- === user_agents ===
DROP POLICY IF EXISTS "admin_user_agents" ON public.user_agents;
CREATE POLICY "admin_user_agents" ON public.user_agents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.system_role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.system_role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS "user_insert_own_agent" ON public.user_agents;
CREATE POLICY "user_insert_own_agent" ON public.user_agents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_update_own_agent" ON public.user_agents;
CREATE POLICY "user_update_own_agent" ON public.user_agents
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- === user_subscriptions ===
DROP POLICY IF EXISTS "admin_all_subs" ON public.user_subscriptions;
CREATE POLICY "admin_all_subs" ON public.user_subscriptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.system_role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS "user_read_own_sub" ON public.user_subscriptions;
CREATE POLICY "user_read_own_sub" ON public.user_subscriptions
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.parent_user_id = user_subscriptions.user_id
    )
  );

-- === support_messages ===
DROP POLICY IF EXISTS "support_messages_user_select" ON public.support_messages;
CREATE POLICY "support_messages_user_select" ON public.support_messages
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "support_messages_user_insert" ON public.support_messages;
CREATE POLICY "support_messages_user_insert" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()) AND sender_role = 'user');

DROP POLICY IF EXISTS "support_messages_user_update" ON public.support_messages;
CREATE POLICY "support_messages_user_update" ON public.support_messages
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

;
