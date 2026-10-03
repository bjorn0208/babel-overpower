
-- Fix FK constraints for conversation delete cascade
ALTER TABLE lead_cards DROP CONSTRAINT IF EXISTS lead_cards_conversation_id_fkey;
ALTER TABLE lead_cards ADD CONSTRAINT lead_cards_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE scheduled_actions DROP CONSTRAINT IF EXISTS scheduled_actions_conversation_id_fkey;
ALTER TABLE scheduled_actions ADD CONSTRAINT scheduled_actions_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_conversation_id_fkey;
ALTER TABLE contracts ADD CONSTRAINT contracts_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- Fix FK for lead delete cascade
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_lead_id_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE lead_cards DROP CONSTRAINT IF EXISTS lead_cards_lead_id_fkey;
ALTER TABLE lead_cards ADD CONSTRAINT lead_cards_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

-- Admin policies for conversations (UPDATE + DELETE)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_conversations' AND tablename = 'conversations') THEN
    CREATE POLICY admin_update_conversations ON conversations FOR UPDATE TO authenticated
      USING (is_platform_admin()) WITH CHECK (is_platform_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_delete_conversations' AND tablename = 'conversations') THEN
    CREATE POLICY admin_delete_conversations ON conversations FOR DELETE TO authenticated
      USING (is_platform_admin());
  END IF;
END $$;

-- User + Admin DELETE policy for leads
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_delete_own_leads' AND tablename = 'leads') THEN
    CREATE POLICY user_delete_own_leads ON leads FOR DELETE TO authenticated
      USING (
        (tenant_id = (select auth.uid()))
        OR (tenant_id IN (
          SELECT profiles.parent_user_id FROM profiles
          WHERE profiles.id = (select auth.uid()) AND profiles.parent_user_id IS NOT NULL
        ))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_leads' AND tablename = 'leads') THEN
    CREATE POLICY admin_update_leads ON leads FOR UPDATE TO authenticated
      USING (is_platform_admin()) WITH CHECK (is_platform_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_delete_leads' AND tablename = 'leads') THEN
    CREATE POLICY admin_delete_leads ON leads FOR DELETE TO authenticated
      USING (is_platform_admin());
  END IF;
END $$;

;
