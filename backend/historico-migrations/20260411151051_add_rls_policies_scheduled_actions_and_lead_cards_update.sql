
-- Policy de UPDATE para lead_cards (authenticated)
-- Padrão: tenant via conversations.tenant_id (mesmo padrão do SELECT existente)
SET search_path = public, auth;

CREATE POLICY "user_update_lead_cards" ON lead_cards
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = lead_cards.conversation_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.parent_user_id = c.tenant_id
          )
        )
    )
  );

-- Policies para scheduled_actions (authenticated)
-- Filtro de tenant via conversation_id -> conversations.tenant_id

CREATE POLICY "user_select_scheduled_actions" ON scheduled_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = scheduled_actions.conversation_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.parent_user_id = c.tenant_id
          )
        )
    )
  );

CREATE POLICY "user_insert_scheduled_actions" ON scheduled_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = scheduled_actions.conversation_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.parent_user_id = c.tenant_id
          )
        )
    )
  );

CREATE POLICY "user_update_scheduled_actions" ON scheduled_actions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = scheduled_actions.conversation_id
        AND (
          c.tenant_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.parent_user_id = c.tenant_id
          )
        )
    )
  );

;
