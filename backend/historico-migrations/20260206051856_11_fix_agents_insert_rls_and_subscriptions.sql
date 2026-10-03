
-- =============================================================
-- Migration 11: Fix agents INSERT RLS + subscriptions helpers
-- =============================================================

-- 1. Fix agents INSERT policy: admin precisa inserir agents para outros users
DROP POLICY IF EXISTS agents_insert_own ON agents;
CREATE POLICY agents_insert_own ON agents
  FOR INSERT
  WITH CHECK (user_id = auth.uid() OR is_admin());

-- 2. Garantir que subscriptions_manage cobre INSERT/UPDATE/DELETE para admin
-- (já existe como ALL para is_admin(), mas vamos garantir o with_check)
DROP POLICY IF EXISTS subscriptions_manage ON subscriptions;
CREATE POLICY subscriptions_manage ON subscriptions
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

;
